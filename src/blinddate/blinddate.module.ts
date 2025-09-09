import { Module } from '@nestjs/common';
import { BlindDateGateway } from '@/blinddate/gateway/blinddate.gateway';
import { BlindDateMessage } from '@/blinddate/message/BlindDateMessage';

@Module({
  providers: [BlindDateGateway, BlindDateMessage],
})
export class BindDateModule {}
