import { Module } from '@nestjs/common';
import { BlindDateGateway } from '@/blinddate/gateway/blinddate.gateway';
import { BlindDateMessage } from '@/blinddate/message/BlindDateMessage';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  providers: [BlindDateGateway, BlindDateMessage],
})
export class BlindDateModule {}
