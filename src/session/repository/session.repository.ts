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
import { MemberNameNotFoundException } from '@/session/exception/MemberNameNotFoundException';

@Injectable()
export class SessionRepository {
  private readonly CHOICE_EXPIRED_TIME = 60 * 60 * 24;
  private readonly BLINDDATE_EXPIRED_TIME = 60 * 60 * 24;
  private readonly NAME_COUNTER_KEY_NAME = 'nameCounter';
  private readonly STATE_KEY_NAME = 'state';
  private readonly REDIS_KEY_PREFIX = 'blinddate';

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

    // 대기중인 방이 아닌 경우 별도 나감 상태를 처리하지 않음
    const state = await this.redisClient.hGet(sessionKey, this.STATE_KEY_NAME);

    // 세션 대기 상태가 아닌 경우 종료
    if (state !== SESSION_STATE.WAITING) {
      return null;
    }

    // 세션 대기 상태인 경우 퇴장 처리
    console.log(`Client out of session: ${sessionId}`);

    const memberSocketKey = `${this.REDIS_KEY_PREFIX}-${sessionId}-${memberId}`;
    const socketAmount = await this.redisClient.sCard(memberSocketKey);
    const volunteer = await this.redisClient.sCard(participantsKey);

    // 여러 디바이스로 접근중인 경우
    if (socketAmount > 1) {
      console.log(
        `Client already joined. sessionId: ${sessionId}, memberId: ${memberId}}`,
      );
      await this.redisClient.sRem(memberSocketKey, memberId.toString());

      return volunteer;
    }

    // 하나의 디바이스로 접근중인 경우
    await this.redisClient
      .multi()
      .sRem(memberSocketKey, memberId.toString())
      .sRem(participantsKey, memberId.toString()) // 참가자 목록에서 회원 정보 제거
      .hDel(memberKey, 'session') // 회원의 세션 정보 초기화
      .exec();

    return volunteer - 1;
  }

  public async addMember(
    sessionId: string,
    memberId: number,
    socketId: string,
  ) {
    const sessionKey = SessionKeyFactory.getSessionKey(sessionId);
    const participantsKey = SessionKeyFactory.getParticipantsKey(sessionId);
    const memberKey = SessionKeyFactory.getMemberKey(memberId);
    const memberSocketKey = SessionKeyFactory.getMemberSocketKey(memberId);
    const socketKey = SessionKeyFactory.getSocketKey(socketId);

    // 이미 존재하는 회원이면 종료
    if (await this.redisClient.sIsMember(participantsKey, String(memberId))) {
      console.log(
        `Client already connected. sessionId: ${sessionId}, memberId: ${memberId}`,
      );
      await this.redisClient.sAdd(memberSocketKey, socketId);

      const name = await this.redisClient.hGet(memberKey, 'name');
      if (!name) {
        throw new MemberNameNotFoundException();
      }

      const volunteer = await this.redisClient.sCard(participantsKey);
      return { volunteer, name };
    }

    // 이름 할당
    const nameCount = await this.redisClient.hIncrBy(
      sessionKey,
      this.NAME_COUNTER_KEY_NAME,
      1,
    );

    const name = `익명${nameCount - 1}`;

    await this.redisClient
      .multi()
      .sAdd(participantsKey, String(memberId)) // 참가자 정보 등록
      .hSet(memberKey, 'name', name) // 사용자 이름 설정
      .hSet(memberKey, 'session', sessionId) // 사용자 세션 설정
      .sAdd(memberSocketKey, memberId.toString()) // 사용사 소켓 목록 추가
      .hSet(socketKey, 'member', memberId) // 소켓에 회원 id 바인드
      .hSet(socketKey, 'session', sessionId) // 소켓에 세션 id 바인드
      .expire(memberSocketKey, this.BLINDDATE_EXPIRED_TIME)
      .expire(memberKey, this.BLINDDATE_EXPIRED_TIME)
      .expire(socketKey, this.BLINDDATE_EXPIRED_TIME)
      .exec();

    const lastVolunteer = await this.redisClient.sCard(participantsKey);
    return { volunteer: lastVolunteer, name };
  }

  public getSocketIdsByMember(memberId: number) {
    const memberSocketKey = SessionKeyFactory.getMemberSocketKey(memberId);
    return this.redisClient.sMembers(memberSocketKey);
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

    // 선택 여부 확인
    const alreadyChoice = await this.redisClient.hExists(
      choiceKeyName,
      choicerId.toString(),
    );

    if (alreadyChoice) {
      return false;
    }

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
      return false;
    }

    // 매칭 성사되었을 때
    await this.redisClient
      .multi()
      .sAdd(matchesKeyName, choicerId.toString())
      .sAdd(matchesKeyName, targetId.toString())
      .exec();

    console.log(
      `matching success ! choicer: ${choicerId} / target: ${targetId}`,
    );

    return true;
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
    console.log('participants', participants);
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

  public async getSessionIdByMemberId(memberId: number) {
    const memberKey = SessionKeyFactory.getMemberKey(memberId);
    const sessionId = await this.redisClient.hGet(memberKey, 'session');

    return sessionId;
  }

  public getSessionStatus(sessionId: string) {
    return this.redisClient.hGet(sessionId, this.STATE_KEY_NAME);
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
