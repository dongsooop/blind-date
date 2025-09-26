import { Module } from '@nestjs/common';
import { BlindDateGateway } from '@/blinddate/gateway/blinddate.gateway';
import { BlindDateMessage } from '@/blinddate/message/BlindDateMessage';
import { HttpModule } from '@nestjs/axios';
import { BlindDateService } from '@/blinddate/service/blinddate.service';
import { BlindDateController } from '@/blinddate/controller/blinddate.controller';
import { SessionModule } from '@/session/session.module';

@Module({
  imports: [HttpModule, SessionModule],
  controllers: [BlindDateController],
  providers: [BlindDateGateway, BlindDateMessage, BlindDateService],
})
export class BlindDateModule {}
