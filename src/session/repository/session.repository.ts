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
      .expire(sessionKeyName, 60 * 60 * 24)
      .exec();

    return sessionId;
  }

  public async addMember(
    sessionId: string,
    memberId: number,
    socketId: string,
  ) {
    const clients = new Set(
      await this.redisClient.sMembers(this.getClientsKeyName(sessionId)),
    );

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
      .hSet(socketKeyName, memberId, socketId)
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
    const targetsChoicer: number[] = JSON.parse(
      (await this.redisClient.hGet(choiceKeyName, targetId + '')) || '[]',
    ) as number[];

    targetsChoicer.push(choicerId);

    await this.redisClient.hSet(
      choiceKeyName,
      targetId,
      JSON.stringify(targetsChoicer),
    );

    // 상대가 날 선택하지 않았을 때
    const voter: number[] = JSON.parse(
      (await this.redisClient.hGet(choiceKeyName, choicerId + '')) || '[]',
    ) as number[];

    const matchesKeyName = this.getMatchesKeyName(sessionId);
    const matched: number[] = JSON.parse(
      (await this.redisClient.get(matchesKeyName)) || '[]',
    ) as number[];

    if (matched.indexOf(targetId) || !voter || !voter.indexOf(targetId)) {
      return false;
    }

    matched.push(choicerId);
    matched.push(targetId);

    await this.redisClient.set(matchesKeyName, JSON.stringify(matched));

    return true;
  }

  public getSocketIdByMemberId(sessionId: string, memberId: number) {
    return this.redisClient.hGet(
      this.getSocketKeyName(sessionId),
      memberId + '',
    );
  }

  public async getAllMembers(sessionId: string) {
    const allMember = (await this.redisClient.hGetAll(
      this.getSocketKeyName(sessionId),
    )) as { [x: number]: string };

    return Object.keys(allMember).map(Number);
  }

  public async getNotMatched(sessionId: string) {
    const allMember = await this.getAllMembers(sessionId);
    const results: number[] = JSON.parse(
      (await this.redisClient.get(this.getMatchesKeyName(sessionId))) || '[]',
    ) as number[];

    return allMember.filter((m) => !results.indexOf(m));
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

  public async startBlindDate() {
    await this.redisClient.hSet('blinddate', 'status', BLIND_DATE_STATUS.OPEN);
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
