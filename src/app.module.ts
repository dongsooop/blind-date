import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BindDateModule } from '@/blinddate/blinddate.module';

@Module({
  imports: [BindDateModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
