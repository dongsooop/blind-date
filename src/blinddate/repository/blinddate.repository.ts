import type { RedisClientType } from 'redis';
import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '@/redis/redis.module';
import { BLIND_DATE_STATUS } from '@/blinddate/constant/blinddate.status';
import { SessionKeyFactory } from '@/session/repository/session-key.factory';

@Injectable()
export class BlindDateRepository {
  private readonly BLINDDATE_KEY_NAME = 'blinddate';
  private readonly BLINDDATE_EXPIRED_TIME = 60 * 60 * 24;
  private readonly MAX_MEMBER_COUNT_KEY_NAME = 'maxMemberCount';
  private readonly STATE_KEY_NAME = 'state';

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
}
