import type { RedisClientType } from 'redis';
import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '@/redis/redis.module';
import { randomUUID } from 'node:crypto';
import {
  SESSION_STATE,
  SESSION_STATE_TYPE,
} from '@/session/const/session.constant';
import Session from '@/session/entity/session.entity';
import { SessionKeyFactory } from '@/session/repository/session-key.factory';
import { SessionIdNotFoundException } from '@/blinddate/exception/SessionIdNotFoundException';
import { Participant } from '@/session/participant.entity';

@Injectable()
export class SessionRepository {
  private readonly CHOICE_EXPIRED_TIME = 60 * 60 * 24;
  private readonly BLINDDATE_EXPIRED_TIME = 60 * 60 * 24;
  private readonly NAME_COUNTER_KEY_NAME = 'nameCounter';
  private readonly STATE_KEY_NAME = 'state';
  private readonly PARTICIPANTS_KEY_NAME = 'participants';

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClientType,
  ) {}

  /**
   * 세션 생성 및 redis 초기화
   */
  public async create(): Promise<string> {
    const sessionId = randomUUID();
    const sessionKey = SessionKeyFactory.getSessionKey(sessionId);

    await this.redisClient
      .multi()
      .hSet(sessionKey, this.STATE_KEY_NAME, SESSION_STATE.WAITING)
      .hSet(sessionKey, this.NAME_COUNTER_KEY_NAME, 1)
      .expire(sessionKey, this.BLINDDATE_EXPIRED_TIME)
      .exec();

    return sessionId;
  }

  public async leave(sessionId: string, memberId: number) {
    const participantsKey = SessionKeyFactory.getParticipantsKey(sessionId);
    const memberKey = SessionKeyFactory.getMemberKey(memberId);
    const sessionKey = SessionKeyFactory.getSessionKey(sessionId);

    for (let retry = 0; retry < 3; retry++) {
      await this.redisClient.watch([sessionKey, participantsKey, memberKey]);

      // 대기중인 방이 아닌 경우 별도 나감 상태를 처리하지 않음
      const state = await this.redisClient.hGet(
        sessionKey,
        this.STATE_KEY_NAME,
      );

      // 세션 대기 상태가 아닌 경우 종료
      if (state !== SESSION_STATE.WAITING) {
        return;
      }

      // 세션 대기 상태인 경우 퇴장 처리
      console.log(`Client out of session: ${sessionId}`);

      const result = await this.redisClient
        .multi()
        .sRem(participantsKey, String(memberId)) // 참가자 목록에서 회원 정보 제거
        .hDel(memberKey, 'session') // 회원의 세션 정보 초기화
        .exec();

      if (result !== null) {
        return;
      }
    }

    console.error(
      `Failed to leave session: ${sessionId} for member: ${memberId}`,
    );
  }

  public async addMember(
    sessionId: string,
    memberId: number,
    socketId: string,
  ) {
    const sessionKey = SessionKeyFactory.getSessionKey(sessionId);
    const participantsKey = SessionKeyFactory.getParticipantsKey(sessionId);
    const memberKey = SessionKeyFactory.getMemberKey(memberId);
    const socketKey = SessionKeyFactory.getSocketKey(socketId);

    // 커밋 중 충돌 시 재시도
    for (let retry = 0; retry < 3; retry++) {
      await this.redisClient.watch([
        sessionKey,
        participantsKey,
        memberKey,
        socketKey,
      ]);

      // 이미 존재하는 회원이면 종료
      if (await this.redisClient.sIsMember(participantsKey, String(memberId))) {
        return;
      }

      const nameCount = Number(
        await this.redisClient.hGet(sessionKey, this.NAME_COUNTER_KEY_NAME),
      );

      const name = `익명${nameCount + 1}`;

      const result = await this.redisClient
        .multi()
        .sAdd(participantsKey, String(memberId)) // 참가자 정보 등록
        .hSet(memberKey, 'name', name) // 사용자 이름 설정
        .hSet(memberKey, 'session', sessionId) // 사용자 세션 설정
        .hSet(socketKey, 'member', memberId) // 소켓에 회원 id 바인드
        .hSet(socketKey, 'session', sessionId) // 소켓에 세션 id 바인드
        .hIncrBy(sessionKey, this.NAME_COUNTER_KEY_NAME, 1)
        .expire(memberKey, this.BLINDDATE_EXPIRED_TIME)
        .expire(socketKey, this.BLINDDATE_EXPIRED_TIME)
        .exec();

      if (result !== null) {
        return;
      }
    }

    await this.redisClient.unwatch();
  }

  public async getParticipantsIdAndName(sessionId: string) {
    const participantsKey = SessionKeyFactory.getParticipantsKey(sessionId);
    const participantIds = await this.redisClient.sMembers(participantsKey);
    const participants: [number, string][] = [];

    for (const memberIdString of participantIds) {
      const memberId = Number(memberIdString);
      const memberKey = SessionKeyFactory.getMemberKey(memberId);
      const name =
        (await this.redisClient.hGet(memberKey, 'name')) || '알 수 없는 사용자';
      participants.push([memberId, name]);
    }

    return participants;
  }

  public getName(memberId: number) {
    const memberKey = SessionKeyFactory.getMemberKey(memberId);
    return this.redisClient.hGet(memberKey, 'name');
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
    const matchesKeyName = SessionKeyFactory.getMatchesKeyName(sessionId);

    for (let retry = 0; retry < 3; retry++) {
      await this.redisClient.watch([choiceKeyName, matchesKeyName]);

      const alreadyChoice = await this.redisClient.hExists(
        choiceKeyName,
        choicerId.toString(),
      );

      if (alreadyChoice) {
        return;
      }

      // 선택자 저장
      const choiceResult = await this.redisClient
        .multi()
        .hSet(choiceKeyName, choicerId, targetId)
        .hExpire(choiceKeyName, choicerId.toString(), this.CHOICE_EXPIRED_TIME)
        .exec();

      if (choiceResult === null) {
        continue;
      }

      // 상대가 날 선택하지 않았을 때
      const targetsPick = await this.redisClient.hGet(
        choiceKeyName,
        targetId.toString(),
      );

      if (!targetsPick || targetsPick !== choicerId.toString()) {
        return;
      }

      // 매칭 성사되었을 때
      const matchedResult = await this.redisClient
        .multi()
        .sAdd(matchesKeyName, choicerId.toString())
        .sAdd(matchesKeyName, targetId.toString())
        .exec();

      if (matchedResult === null) {
        continue;
      }

      console.log(
        `matching success ! choicer: ${choicerId} / target: ${targetId}`,
      );

      return true;
    }
  }

  public async getAllMembers(sessionId: string): Promise<number[]> {
    const participantsKey = SessionKeyFactory.getParticipantsKey(sessionId);
    const participantsString = await this.redisClient.sMembers(participantsKey);

    return participantsString.map((v) => Number(v));
  }

  public async getNotMatched(sessionId: string) {
    const matchedKey = SessionKeyFactory.getMatchesKeyName(sessionId);
    const allMembers = await this.getAllMembers(sessionId);

    const matchedMemberString = await this.redisClient.sMembers(matchedKey);

    if (!matchedMemberString || matchedMemberString.length === 0) {
      return allMembers;
    }

    const matchedMembers = new Set(
      matchedMemberString.map((v: string) => Number(v)),
    );

    return allMembers.filter((memberId) => {
      return !matchedMembers.has(memberId);
    });
  }

  public async getSession(sessionId: string) {
    const participantsKey = SessionKeyFactory.getParticipantsKey(sessionId);
    const rawData = await this.getSessionData(sessionId);
    if (!rawData) {
      throw new SessionIdNotFoundException();
    }

    const participants = await this.redisClient.sMembers(participantsKey);

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
