import { Module } from '@nestjs/common';
import { BlindDateMessage } from '@/blinddate/message/BlindDateMessage';
import { HttpModule, HttpService } from '@nestjs/axios';
import { BlindDateService } from '@/blinddate/service/blinddate.service';
import { BlindDateController } from '@/blinddate/controller/blinddate.controller';
import { SessionModule } from '@/session/session.module';
import { BlindDateRepository } from '@/blinddate/repository/blinddate.repository';

@Module({
  imports: [HttpModule, SessionModule, HttpService],
  controllers: [BlindDateController],
  providers: [BlindDateMessage, BlindDateService, BlindDateRepository],
  exports: [BlindDateService, BlindDateMessage],
})
export class BlindDateModule {}
