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
  public async isAvailable() {
    return await this.blindDateService.isAvailable();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  public async availableSession(
    @Body() request: { expiredDate: string; maxSessionMemberCount: number },
  ) {
    const expired = new Date(request.expiredDate);
    const req = new BlindDateAvailableRequest(
      expired,
      request.maxSessionMemberCount,
    );
    await this.blindDateService.availableBlindDate(req);
  }
}
