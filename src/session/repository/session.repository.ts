import type { RedisClientType } from 'redis';
import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '@/redis/redis.module';
import { randomUUID } from 'node:crypto';
import {
  SESSION_STATE,
  SESSION_STATE_TYPE,
} from '@/session/const/session.constant';
import Session from '@/session/entity/session.entity';
import { BLIND_DATE_STATUS } from '@/blinddate/constant/blinddate.status';
import { SessionKeyFactory } from '@/session/repository/session-key.factory';
import { SessionIdNotFoundException } from '@/blinddate/exception/SessionIdNotFoundException';
import { Participant } from '@/session/participant.entity';

@Injectable()
export class SessionRepository {
  private readonly BLINDDATE_KEY_NAME = 'blinddate';
  private readonly CHOICE_EXPIRED_TIME = 60 * 60 * 24;
  private readonly BLINDDATE_EXPIRED_TIME = 60 * 60 * 24;
  private readonly NAME_COUNTER_KEY_NAME = 'nameCounter';
  private readonly MAX_MEMBER_COUNT_KEY_NAME = 'maxMemberCount';
  private readonly STATE_KEY_NAME = 'state';
  private readonly PARTICIPANTS_KEY_NAME = 'participants';

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClientType,
  ) {}

  public getPointer() {
    return this.redisClient.get(SessionKeyFactory.getPointerKeyName());
  }

  public async setPointerExpire(expiredTime: number) {
    await this.redisClient.expireAt(
      SessionKeyFactory.getPointerKeyName(),
      expiredTime,
    );
  }

  public async setPointer(pointer: string) {
    await this.redisClient.set(SessionKeyFactory.getPointerKeyName(), pointer);
  }

  /**
   * 세션 생성 및 redis 초기화
   */
  public async create(): Promise<string> {
    const sessionId = randomUUID();
    const sessionKey = SessionKeyFactory.getSessionKey(sessionId);

    await this.redisClient
      .multi()
      .hSet(sessionKey, {
        [this.PARTICIPANTS_KEY_NAME]: JSON.stringify([]),
        [this.STATE_KEY_NAME]: SESSION_STATE.WAITING,
        [this.NAME_COUNTER_KEY_NAME]: 1,
      })
      .expire(sessionKey, this.BLINDDATE_EXPIRED_TIME)
      .exec();

    return sessionId;
  }

  public async leave(sessionIds: Set<string>, socketId: string) {
    const socketKey = SessionKeyFactory.getSocketKey(socketId);
    const memberId = Number(
      (await this.redisClient.hGet(socketKey, 'member')) || 0,
    );

    const memberKey = SessionKeyFactory.getMemberKey(memberId);
    const socketIdsRaw = await this.redisClient.hGet(memberKey, 'socket');

    const socketIds = JSON.parse(socketIdsRaw || '[]') as string[];

    for (const sessionId of sessionIds) {
      const sessionKey = SessionKeyFactory.getSessionKey(sessionId);

      // 대기중인 방이 아닌 경우 별도 나감 상태를 처리하지 않음
      const state = await this.redisClient.hGet(
        sessionKey,
        this.STATE_KEY_NAME,
      );

      if (state !== SESSION_STATE.WAITING) {
        continue;
      }

      const participantsRaw =
        (await this.redisClient.hGet(sessionKey, this.PARTICIPANTS_KEY_NAME)) ||
        '[]';

      const participants = JSON.parse(participantsRaw) as Participant[];

      // 소켓이 하나일 때 세션에서 나간 것으로 처리
      if (socketIds.length == 1) {
        const participantsFiltered = participants.filter(
          (participant) => !participant.hasSocketId(sessionId),
        );

        await this.redisClient
          .multi()
          .hSet(
            SessionKeyFactory.getSessionKey(sessionId),
            this.PARTICIPANTS_KEY_NAME,
            JSON.stringify(participantsFiltered),
          ) // 참가자 목록에서 회원 정보 제거
          .del(SessionKeyFactory.getSocketKey(socketId)) // 소켓 키 삭제
          .del(memberKey) // 회원 정보 삭제
          .exec();
      }

      // 회원에게 등록된 소켓이 두 개 이상일 경우 소켓 정보만 제거
      if (socketIds.length > 1) {
        const socketIdsFiltered = socketIds.filter((v) => v !== socketId);
        participants.forEach((participant) => {
          if (participant.hasSocketId(sessionId)) {
            participant.removeSocketId(socketId);
          }
        });

        await this.redisClient
          .multi()
          .hSet(
            SessionKeyFactory.getSessionKey(sessionId),
            this.PARTICIPANTS_KEY_NAME,
            JSON.stringify(participants),
          ) // 참가자 목록에서 소켓 아이디 제거
          .del(SessionKeyFactory.getSocketKey(socketId)) // 소켓 키 삭제
          .hSet(memberKey, 'socket', JSON.stringify(socketIdsFiltered))
          .exec();
      }
    }
  }

  public async addMember(
    sessionId: string,
    memberId: number,
    socketId: string,
  ) {
    const sessionKey = SessionKeyFactory.getSessionKey(sessionId);
    const memberKey = SessionKeyFactory.getMemberKey(memberId);
    const socketKey = SessionKeyFactory.getSocketKey(socketId);

    await this.redisClient.watch([sessionKey, memberKey, socketKey]);

    // 이미 존재하는 회원인지 검사
    if ((await this.redisClient.hGet(memberKey, 'session')) === sessionId) {
      const name = await this.redisClient.hGet(memberKey, 'name');

      const participants = await this.getParticipants(sessionId);

      participants.forEach((participant) => {
        if (participant.equalsMemberId(memberId)) {
          participant.addSocketId(socketId);
        }
      });

      const socketIds = await this.getSocketIds(memberId);
      socketIds.push(socketId);

      if (name !== null) {
        // 소켓 아이디 추가
        await this.redisClient
          .multi()
          .hSet(
            sessionKey,
            this.PARTICIPANTS_KEY_NAME,
            JSON.stringify(participants),
          ) // 참가자 목록에 소켓 아이디 추가
          .hSet(memberKey, 'socket', JSON.stringify(socketIds)) // 사용자 소켓 추가
          .hSet(memberKey, 'session', sessionId) // 사용자 세션 설정
          .hSet(socketKey, 'member', memberId) // 소켓에 회원 id 바인드
          .hSet(socketKey, 'session', sessionId) // 소켓에 세션 id 바인드
          .hSet(socketKey, 'name', name) // 소켓에 이름 바인드
          .expire(memberKey, this.BLINDDATE_EXPIRED_TIME)
          .expire(socketKey, this.BLINDDATE_EXPIRED_TIME)
          .exec();

        await this.redisClient.unwatch();

        return;
      }
    }

    const participantsRaw: string | null = await this.redisClient.hGet(
      sessionKey,
      this.PARTICIPANTS_KEY_NAME,
    );

    const nameCount = participantsRaw
      ? ((JSON.parse(participantsRaw) as any[]).length ?? 1)
      : 1;

    const name = `익명${nameCount}`;

    const participants = await this.getParticipants(sessionId);
    participants.push(new Participant(memberId, [socketId], name));

    await this.redisClient
      .multi()
      .hSet(
        sessionKey,
        this.PARTICIPANTS_KEY_NAME,
        JSON.stringify(participants),
      ) // 참가자 정보 등록
      .hSet(memberKey, 'name', name) // 사용자 이름 설정
      .hSet(memberKey, 'session', sessionId) // 사용자 세션 설정
      .hSet(memberKey, 'socket', JSON.stringify([socketId])) // 사용자 소켓 추가
      .hSet(socketKey, 'member', memberId) // 소켓에 회원 id 바인드
      .hSet(socketKey, 'session', sessionId) // 소켓에 세션 id 바인드
      .hSet(socketKey, 'name', name) // 소켓에 이름 바인드
      .expire(memberKey, this.BLINDDATE_EXPIRED_TIME)
      .expire(socketKey, this.BLINDDATE_EXPIRED_TIME)
      .exec();

    await this.redisClient.unwatch();
  }

  public async getParticipants(sessionId: string) {
    const sessionKey = SessionKeyFactory.getSessionKey(sessionId);

    const participantsRaw =
      (await this.redisClient.hGet(sessionKey, this.PARTICIPANTS_KEY_NAME)) ||
      '[]';

    const participantsParsed = JSON.parse(participantsRaw) as {
      memberId: number;
      socketIds: string[];
      name: string;
    }[];

    return participantsParsed.map((p) => {
      return new Participant(p.memberId, p.socketIds, p.name);
    });
  }

  public async getSocketIds(memberId: number) {
    const memberKey = SessionKeyFactory.getMemberKey(memberId);

    const socketIdsRaw =
      (await this.redisClient.hGet(memberKey, 'socket')) || '[]';

    return JSON.parse(socketIdsRaw) as string[];
  }

  public getName(sessionId: string, memberId: number) {
    return this.getParticipants(sessionId).then((participants) => {
      return participants
        .filter((participant) => participant.equalsMemberId(memberId))
        .map((participant) => participant.getName())[0];
    });
  }

  public async start(sessionId: string) {
    await this.redisClient.hSet(
      SessionKeyFactory.getSessionKey(sessionId),
      this.STATE_KEY_NAME,
      SESSION_STATE.PROCESSING,
    );
  }

  public async choice(sessionId: string, choicerId: number, targetId: number) {
    const choiceKeyName = SessionKeyFactory.getChoiceKeyName(sessionId);

    // 선택자 저장
    await this.redisClient
      .multi()
      .hSet(choiceKeyName, choicerId, targetId)
      .hExpire(choiceKeyName, choicerId.toString(), this.CHOICE_EXPIRED_TIME)
      .exec();

    // 상대가 날 선택하지 않았을 때
    const targetsPick = await this.redisClient.hGet(
      choiceKeyName,
      targetId.toString(),
    );

    if (!targetsPick || targetsPick !== choicerId.toString()) {
      return;
    }

    // 매칭 성사되었을 때
    const matchesKeyName = SessionKeyFactory.getMatchesKeyName(sessionId);
    const matched: string[] = JSON.parse(
      (await this.redisClient.get(matchesKeyName)) || '[]',
    ) as string[];

    if (matched.includes(targetId.toString())) {
      return false;
    }

    matched.push(choicerId.toString());
    matched.push(targetId.toString());

    console.log(matched);

    await this.redisClient.set(matchesKeyName, JSON.stringify(matched));

    return true;
  }

  public async getSocketIdByMemberId(sessionId: string, memberId: number) {
    const participants = await this.getParticipants(sessionId);
    return participants
      .filter((participant) => participant.equalsMemberId(memberId))
      .map((participant) => participant.getSocketIds())
      .flatMap((v) => [...v.values()]);
  }

  public async getAllMembers(
    sessionId: string,
  ): Promise<Map<number, string[]>> {
    const participants = await this.getParticipants(sessionId);

    return participants.reduce((acc, cur) => {
      acc.set(cur.getMemberId(), cur.getSocketIds());
      return acc;
    }, new Map<number, string[]>());
  }

  public async getNotMatched(sessionId: string) {
    const allMembersSocket = await this.getAllMembers(sessionId);

    const matched = await this.redisClient.get(
      SessionKeyFactory.getMatchesKeyName(sessionId),
    );

    if (matched) {
      const matchedUsers = (JSON.parse(matched) as string[]).map((v: string) =>
        Number(v),
      );

      matchedUsers.forEach((user) => {
        allMembersSocket.delete(user);
      });
    }

    return [...allMembersSocket.values()].flatMap((v) => [...v]);
  }

  public async setMaxSessionMemberCount(count: number) {
    await this.redisClient.hSet(
      this.BLINDDATE_KEY_NAME,
      this.MAX_MEMBER_COUNT_KEY_NAME,
      count,
    );
  }

  public getMaxSessionMemberCount() {
    return this.redisClient.hGet(
      this.BLINDDATE_KEY_NAME,
      this.MAX_MEMBER_COUNT_KEY_NAME,
    );
  }

  public async getSession(sessionId: string) {
    const rawData = await this.getSessionData(sessionId);
    if (!rawData) {
      throw new SessionIdNotFoundException();
    }

    const participantsRaw = rawData[this.PARTICIPANTS_KEY_NAME];
    const participants: Participant[] =
      this.parsedParticipants(participantsRaw);

    const sessionData = {
      participants,
      state: rawData[this.STATE_KEY_NAME] as SESSION_STATE_TYPE,
      nameCounter: Number(rawData[this.NAME_COUNTER_KEY_NAME]),
    };

    return new Session(sessionData);
  }

  public async terminate(sessionId: string) {
    const sessionKeyName = SessionKeyFactory.getSessionKey(sessionId);

    await this.redisClient.hSet(
      sessionKeyName,
      this.STATE_KEY_NAME,
      SESSION_STATE.ENDED,
    );
  }

  public getSessionIdByMemberId(memberId: number): Promise<string | null> {
    const memberKey = SessionKeyFactory.getMemberKey(memberId);
    return this.redisClient.hGet(memberKey, 'session');
  }

  public async startBlindDate() {
    await this.redisClient
      .multi()
      .hSet(
        this.BLINDDATE_KEY_NAME,
        this.STATE_KEY_NAME,
        BLIND_DATE_STATUS.OPEN,
      )
      .expire(this.BLINDDATE_KEY_NAME, this.BLINDDATE_EXPIRED_TIME)
      .exec();
  }

  public async closeBlindDate() {
    await this.redisClient.hSet(
      this.BLINDDATE_KEY_NAME,
      this.STATE_KEY_NAME,
      BLIND_DATE_STATUS.CLOSE,
    );
  }

  public getBlindDateStatus() {
    return this.redisClient.hGet(this.BLINDDATE_KEY_NAME, this.STATE_KEY_NAME);
  }

  private parsedParticipants(participantsRaw: string): Participant[] {
    const participantsParsed: {
      memberId: string;
      socketId: string[];
      name: string;
    }[] = participantsRaw
      ? (JSON.parse(participantsRaw) as {
          memberId: string;
          socketId: string[];
          name: string;
        }[])
      : [];

    return participantsParsed.map(
      (participant) =>
        new Participant(
          Number(participant.memberId),
          participant.socketId,
          participant.name,
        ),
    );
  }

  private getSessionData(sessionId: string) {
    const redisSessionName = SessionKeyFactory.getSessionKey(sessionId);
    return this.redisClient.hGetAll(redisSessionName);
  }
}
