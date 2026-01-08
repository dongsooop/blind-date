import { Module } from '@nestjs/common';
import { BlindDateGateway } from '@/blinddate/gateway/blinddate.gateway';
import { BlindDateMessage } from '@/blinddate/message/BlindDateMessage';
import { HttpModule, HttpService } from '@nestjs/axios';
import { BlindDateService } from '@/blinddate/service/blinddate.service';
import { BlindDateController } from '@/blinddate/controller/blinddate.controller';
import { SessionModule } from '@/session/session.module';
import { BlindDateRepository } from '@/blinddate/repository/blinddate.repository';

@Module({
  imports: [HttpModule, SessionModule, HttpService],
  controllers: [BlindDateController],
  providers: [
    BlindDateGateway,
    BlindDateMessage,
    BlindDateService,
    BlindDateRepository,
  ],
})
export class BlindDateModule {}
