import { Global, Module } from '@nestjs/common';
import { QueueProducer } from '@/queue/queue.producer';
import { QueueConsumer } from '@/queue/queue.consumer';
import { RedisModule } from '@/redis/redis.module';
import { SessionModule } from '@/session/session.module';
import { BlindDateModule } from '@/blinddate/blinddate.module';

@Global()
@Module({
  imports: [RedisModule, SessionModule, BlindDateModule],
  providers: [QueueProducer, QueueConsumer],
  exports: [QueueProducer, QueueConsumer],
})
export class QueueModule {}
