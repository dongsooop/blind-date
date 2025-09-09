import { Module } from '@nestjs/common';
import { BlindDateGateway } from '@/blinddate/gateway/blinddate.gateway';

@Module({
  providers: [BlindDateGateway],
})
export class BindDateModule {}
