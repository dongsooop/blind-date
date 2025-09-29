import nodeCron from 'node-cron';
import { BlindDateAvailableRequest } from '@/blinddate/dto/blinddate.available.dto';
import { SessionRepository } from '@/session/repository/session.repository';
import { BLIND_DATE_STATUS } from '@/blinddate/constant/blinddate.status';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BlindDateService {
  private status = false;
  private maxSessionMemberCount: number;
  private eventMessageAmount: number;

  constructor(private readonly sessionRepository: SessionRepository) {}

  public availableBlindDate(request: BlindDateAvailableRequest) {
    this.status = true;
    this.maxSessionMemberCount = request.getMaxSessionMemberCount();

    const expiredMinute = request.getExpiredDate().getMinutes();
    const expiredHour = request.getExpiredDate().getHours();
    const expiredDay = request.getExpiredDate().getDate();
    const expiredMonth = request.getExpiredDate().getMonth();
    const expression = `0 ${expiredMinute} ${expiredHour} ${expiredDay} ${expiredMonth + 1} * *`;

    nodeCron.schedule(expression, async () => {
      await this.sessionRepository.closeBlindDate();
    });
  }

  public async isAvailable(): Promise<boolean> {
    const status = await this.sessionRepository.getBlindDateStatus();

    if (!status || status === BLIND_DATE_STATUS.CLOSE) {
      return false;
    }

    if (status === BLIND_DATE_STATUS.OPEN) {
      return true;
    }

    return false;
  }

  public getMaxSessionMemberCount() {
    return this.maxSessionMemberCount;
  }
}
