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
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';

@Controller('blinddate')
export class BlindDateController {
  constructor(
    readonly blindDateService: BlindDateService,
    readonly httpService: HttpService,
  ) {}

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
    if (await this.blindDateService.isAvailable()) {
      return;
    }

    const expired = new Date(request.expiredDate);
    const req = new BlindDateAvailableRequest(
      expired,
      request.maxSessionMemberCount,
    );
    await this.blindDateService.availableBlindDate(req);

    // 과팅 알림 API 호출
    const requestHeader = {
      headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
    };
    const url = `https://${process.env.SERVER_DOMAIN}${process.env.BLINDDATE_NOTIFICATION_API}`;

    // 채팅방 생성
    return await firstValueFrom(
      this.httpService.post(url, null, requestHeader),
    );
  }
}
