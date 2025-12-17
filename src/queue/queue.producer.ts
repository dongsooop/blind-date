import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '@/redis/redis.module';
import type { RedisClientType } from 'redis';
import { BlindDateQueue } from '@/queue/blinddate.queue';

@Injectable()
export class QueueProducer {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClientType,
  ) {}

  async pushEnterQueue(data: { socketId: string }) {
    const json = JSON.stringify({
      type: BlindDateQueue.ENTER,
      timestamp: Date.now(),
      ...data,
    });

    await this.redisClient.lPush('blinddate:queue', json);
    await this.redisClient.publish('blinddate:queue:signal', 'new');
  }

  async pushLeaveQueue(data: { socketId: string }) {
    await this.redisClient.lPush(
      'blinddate:queue',
      JSON.stringify({
        type: BlindDateQueue.LEAVE,
        timestamp: Date.now(),
        ...data,
      }),
    );
    await this.redisClient.publish('blinddate:queue:signal', 'new');
  }

  async pushChoiceQueue(data: {
    sessionId: string;
    memberId: number;
    socketId: string;
    targetId: number;
  }) {
    await this.redisClient.lPush(
      'blinddate:queue',
      JSON.stringify({
        type: BlindDateQueue.CHOICE,
        timestamp: Date.now(),
        ...data,
      }),
    );
    await this.redisClient.publish('blinddate:queue:signal', 'new');
  }
}
