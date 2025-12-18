import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '@/redis/redis.module';
import type { RedisClientType } from 'redis';
import { BlindDateQueue } from '@/queue/blinddate.queue';

@Injectable()
export class QueueProducer {
  private readonly SESSION_QUEUE_KEY =
    process.env.SESSION_QUEUE_KEY || 'blinddate-session-queue';
  private readonly CHOICE_QUEUE_KEY =
    process.env.CHOICE_QUEUE_KEY || 'blinddate-choice-queue';

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClientType,
  ) {}

  async pushEnterQueue(data: { socketId: string }) {
    const json = JSON.stringify({
      type: BlindDateQueue.ENTER,
      timestamp: Date.now(),
      ...data,
    });

    await this.redisClient.lPush(this.SESSION_QUEUE_KEY, json);
  }

  async pushLeaveQueue(data: {
    memberId: number;
    sessionId: string;
    socketId: string;
  }) {
    const json = JSON.stringify({
      type: BlindDateQueue.LEAVE,
      timestamp: Date.now(),
      ...data,
    });

    await this.redisClient.lPush(this.SESSION_QUEUE_KEY, json);
  }

  async pushChoiceQueue(data: {
    sessionId: string;
    memberId: number;
    socketId: string;
    targetId: number;
  }) {
    const json = JSON.stringify({
      type: BlindDateQueue.CHOICE,
      timestamp: Date.now(),
      ...data,
    });

    await this.redisClient.lPush(this.CHOICE_QUEUE_KEY, json);
  }
}
