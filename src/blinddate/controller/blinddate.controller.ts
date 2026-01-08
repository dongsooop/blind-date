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

    const servers = process.env.MAIN_SERVER_CONTAINER_NAME?.split(',');
    if (!servers) {
      console.error('No server configured for notification');
      return;
    }

    for (const server of servers) {
      // 같은 네트워크 내 스프링 서비스로 POST 요청 (예: Docker Compose 서비스 이름 사용)
      try {
        const payload = {
          expired: expired.toISOString(),
          maxSessionMemberCount: request.maxSessionMemberCount,
        };
        await firstValueFrom(
          this.httpService.post(
            `http://${server}:8080/api/blinddate/notification`,
            payload,
          ),
        );

        console.log(`Notification sent to server: ${server}`);
      } catch (e) {
        // 실패 시 처리(로깅 등) 필요 시 추가
        console.error('failed to send request for notification', e);
      }
    }
  }
}
