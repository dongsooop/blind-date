import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BlindDateModule } from '@/blinddate/blinddate.module';

@Module({
  imports: [BlindDateModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
