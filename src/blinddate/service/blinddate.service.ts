import nodeCron from 'node-cron';
import { BlindDateAvailableRequest } from '@/blinddate/dto/blinddate.available.dto';

export class BlindDateService {
  private status = false;
  private maxSessionMemberCount: number;
  private eventMessageAmount: number;

  public availableBlindDate(request: BlindDateAvailableRequest) {
    this.status = true;
    this.maxSessionMemberCount = request.getMaxSessionMemberCount();

    const expiredMinute = request.getExpiredDate().getMinutes();
    const expiredHour = request.getExpiredDate().getHours();
    const expiredDay = request.getExpiredDate().getDate();
    const expiredMonth = request.getExpiredDate().getMonth();
    const expression = `0 ${expiredMinute} ${expiredHour} ${expiredDay} ${expiredMonth + 1} * *`;

    nodeCron.schedule(expression, () => {
      this.status = false;
    });
  }

  public isAvailable(): boolean {
    return this.status;
  }

  public getMaxSessionMemberCount() {
    return this.maxSessionMemberCount;
  }
}
