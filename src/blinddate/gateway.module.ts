import { Module } from '@nestjs/common';
import { BlindDateGateway } from '@/blinddate/gateway/blinddate.gateway';
import { QueueModule } from '@/queue/queue.module';
import { SessionModule } from '@/session/session.module';
import { BlindDateModule } from '@/blinddate/blinddate.module';

@Module({
  imports: [SessionModule, BlindDateModule, QueueModule],
  providers: [BlindDateGateway],
})
export class GatewayModule {}
