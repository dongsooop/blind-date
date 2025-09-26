import { Global, Module } from '@nestjs/common';
import { createRedisProvider } from './redis.provider';

export const REDIS_CLIENT = 'REDIS_CLIENT' as const;

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: createRedisProvider,
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
