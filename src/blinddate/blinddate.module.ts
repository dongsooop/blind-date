import { Module } from '@nestjs/common';
import { BlindDateGateway } from '@/blinddate/gateway/blinddate.gateway';
import { BlindDateMessage } from '@/blinddate/message/BlindDateMessage';
import { HttpModule } from '@nestjs/axios';
import { BlindDateService } from '@/blinddate/service/blinddate.service';

@Module({
  imports: [HttpModule],
  providers: [BlindDateGateway, BlindDateMessage, BlindDateService],
})
export class BlindDateModule {}
