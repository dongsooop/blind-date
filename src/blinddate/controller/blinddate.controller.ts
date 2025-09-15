import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { BlindDateService } from '@/blinddate/service/blinddate.service';

@Controller('blinddate')
export class BlindDateController {
  constructor(readonly blindDateService: BlindDateService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  public isAvailable() {
    return this.blindDateService.isAvailable();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  public availableSession(@Body() expiredDate: Date) {
    this.blindDateService.availableBlindDate(expiredDate);
  }
}
