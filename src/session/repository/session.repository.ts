import type { RedisClientType } from 'redis';
import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '@/redis/redis.module';
import { randomUUID } from 'node:crypto';
import {
  SESSION_STATE,
  SESSION_STATE_TYPE,
} from '@/session/const/session.constant';
import { SessionIdNotFoundException } from '@/blinddate/exception/SessionIdNotFoundException';
import Session from '@/session/entity/session.entity';
import { BLIND_DATE_STATUS } from '@/blinddate/constant/blinddate.status';

@Injectable()
export class SessionRepository {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClientType,
  ) {}

  public getPointer() {
    return this.redisClient.get(this.getPointerKeyName());
  }

  public async setPointerExpire(expiredTime: number) {
    await this.redisClient.expireAt(this.getPointerKeyName(), expiredTime);
  }

  public async setPointer(pointer: string) {
    await this.redisClient.set(this.getPointerKeyName(), pointer);
  }

  public async create(): Promise<string> {
    const sessionId = randomUUID();
    const sessionKeyName = this.getSessionKeyName(sessionId);

    await this.redisClient
      .multi()
      .hSet(sessionKeyName, 'volunteer', 0)
      .hSet(sessionKeyName, 'nameCounter', 1)
      .hSet(sessionKeyName, 'state', SESSION_STATE.WAITING)
      .exec();

    return sessionId;
  }

  public async initPointer() {
    await this.redisClient.del(this.getPointerKeyName());
  }

  public async leave(sessionIds: Set<string>, socketId: string) {
    for (const sessionId of sessionIds) {
      // 대기중인 방이 아닌 경우 별도 나감 상태를 처리하지 않음
      const state = await this.redisClient.hGet(
        this.getSessionKeyName(sessionId),
        'state',
      );

      if (state !== SESSION_STATE.WAITING) {
        continue;
      }

      const socketKeyName = this.getSocketKeyName(sessionId);
      const socketHash = await this.redisClient.hGetAll(socketKeyName);

      const reversed = Object.fromEntries(
        Object.entries(socketHash).map(([key, value]) => [value, key]),
      );

      const memberId = reversed[socketId];
      await this.redisClient.hDel(socketKeyName, memberId); // 소켓 이름 제거
      // 인원수 1 감소
      await this.redisClient.hIncrBy(
        this.getSessionKeyName(sessionId),
        'volunteer',
        -1,
      );
    }
  }

  public async addMember(
    sessionId: string,
    memberId: number,
    socketId: string,
  ) {
    const clientKeyName = this.getClientsKeyName(sessionId);
    const clients = new Set(await this.redisClient.sMembers(clientKeyName));

    const socketKeyName = this.getSocketKeyName(sessionId);

    // 이미 방에 참여한 사람일 경우 소켓 id 업데이트
    if (clients.has(memberId.toString())) {
      await this.redisClient.hSet(socketKeyName, memberId, socketId);
      return;
    }

    const sessionKeyName = this.getSessionKeyName(sessionId);

    const nameCount = Number(
      await this.redisClient.hGet(sessionKeyName, 'nameCounter'),
    );

    await this.redisClient
      .multi()
      .hIncrBy(sessionKeyName, 'volunteer', 1) // 사용자 증가
      .hSet(this.getNameKeys(sessionId), memberId, `동냥이${nameCount}`) // 회원 id에 사용자 이름 할당
      .hIncrBy(sessionKeyName, 'nameCounter', 1) // 사용자 식별자 증가
      .hSet(socketKeyName, memberId, socketId) // 소켓 목록에 사용자 id 바인드
      .sAdd(clientKeyName, memberId.toString()) // 사용자 목록에 추가
      .exec(); // 회원 id에 소켓 id 할당
  }

  public async getName(sessionId: string, memberId: number) {
    const name = await this.redisClient.hGet(
      this.getNameKeys(sessionId),
      memberId.toString(),
    );

    if (!name) {
      throw new Error(`Unable to get member '${memberId}'`);
    }

    return name;
  }

  public async start(sessionId: string) {
    await this.redisClient.hSet(
      this.getSessionKeyName(sessionId),
      'state',
      SESSION_STATE.PROCESSING,
    );
  }

  public async choice(sessionId: string, choicerId: number, targetId: number) {
    const choiceKeyName = this.getChoiceKeyName(sessionId);

    // 선택자 저장
    await this.redisClient
      .multi()
      .hSet(choiceKeyName, choicerId, targetId)
      .hExpire(choiceKeyName, choicerId.toString(), 60 * 60 * 24)
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
    const matchesKeyName = this.getMatchesKeyName(sessionId);
    const matched: string[] = JSON.parse(
      (await this.redisClient.get(matchesKeyName)) || '[]',
    ) as string[];

    if (matched.includes(targetId.toString())) {
      return false;
    }

    matched.push(choicerId.toString());
    matched.push(targetId.toString());

    await this.redisClient.set(matchesKeyName, JSON.stringify(matched));

    return true;
  }

  public getSocketIdByMemberId(sessionId: string, memberId: number) {
    return this.redisClient.hGet(
      this.getSocketKeyName(sessionId),
      memberId + '',
    );
  }

  public async getAllMembers(sessionId: string): Promise<string[][]> {
    const allMember = (await this.redisClient.hGetAll(
      this.getNameKeys(sessionId),
    )) as { [x: number]: string };

    return Object.entries(allMember);
  }

  public async getNotMatched(sessionId: string) {
    const allMembersSocket = (await this.redisClient.hGetAll(
      this.getSocketKeyName(sessionId),
    )) as { [x: number]: string };

    const allMember: number[] = Object.keys(allMembersSocket).map(Number);

    const matched = await this.redisClient.get(
      this.getMatchesKeyName(sessionId),
    );

    if (!matched) {
      return Object.values(allMembersSocket);
    }

    const matchedUserSet = JSON.parse(matched) as Set<number>;

    return allMember
      .filter((member) => !matchedUserSet.has(member))
      .map((member) => allMembersSocket[member]);
  }

  private getSessionData(sessionId: string) {
    const redisSessionName = this.getSessionKeyName(sessionId);
    return this.redisClient.hGetAll(redisSessionName);
  }

  public async setMaxSessionMemberCount(count: number) {
    await this.redisClient.hSet('blinddate', 'maxMemberCount', count);
  }

  public getMaxSessionMemberCount() {
    return this.redisClient.hGet('blinddate', 'maxMemberCount');
  }

  public async getSession(sessionId: string) {
    const rawData = await this.getSessionData(sessionId);
    const sessionData = {
      volunteer: Number(rawData['volunteer']),
      state: rawData['state'] as SESSION_STATE_TYPE,
      nameCounter: Number(rawData['nameCounter']),
    };
    if (!sessionData) {
      throw new SessionIdNotFoundException();
    }

    return new Session(sessionData);
  }

  public async terminate(sessionId: string) {
    const sessionKeyName = this.getSessionKeyName(sessionId);

    await this.redisClient.hSet(sessionKeyName, 'state', SESSION_STATE.ENDED);
  }

  public async startBlindDate() {
    await this.redisClient
      .multi()
      .hSet('blinddate', 'status', BLIND_DATE_STATUS.OPEN)
      .expire('blinddate', 60 * 60 * 24)
      .exec();
  }

  public async closeBlindDate() {
    await this.redisClient.hSet('blinddate', 'status', BLIND_DATE_STATUS.CLOSE);
  }

  public getBlindDateStatus() {
    return this.redisClient.hGet('blinddate', 'status');
  }

  private getNameKeys(sessionId: string) {
    return `blinddate-name-map-${sessionId}`;
  }

  private getClientsKeyName(sessionId: string) {
    return `blinddate-clients-${sessionId}`;
  }

  private getSessionKeyName(sessionId: string) {
    return `blinddate-${sessionId}`;
  }

  private getSocketKeyName(sessionId: string) {
    return `blinddate-socket-${sessionId}`;
  }

  private getChoiceKeyName(sessionId: string) {
    return `blinddate-choice-${sessionId}`;
  }

  private getMatchesKeyName(sessionId: string) {
    return `blinddate-matches-${sessionId}`;
  }

  private getPointerKeyName() {
    return 'blinddate-pointer';
  }
}
