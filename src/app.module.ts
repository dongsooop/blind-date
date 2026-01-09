import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BlindDateModule } from '@/blinddate/blinddate.module';
import { RedisModule } from '@/redis/redis.module';
import { SessionModule } from '@/session/session.module';
import { QueueModule } from '@/queue/queue.module';
import { GatewayModule } from '@/blinddate/gateway.module';

@Module({
  imports: [
    BlindDateModule,
    RedisModule,
    SessionModule,
    QueueModule,
    GatewayModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
