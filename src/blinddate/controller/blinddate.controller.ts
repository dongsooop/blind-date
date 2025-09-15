import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { BlindDateService } from '@/blinddate/service/blinddate.service';
import { BlindDateAvailableRequest } from '@/blinddate/dto/blinddate.available.dto';

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
  public availableSession(@Body() request: BlindDateAvailableRequest) {
    this.blindDateService.availableBlindDate(request);
  }
}
