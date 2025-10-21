import { MinimumPeriodNotMetException } from '@/blinddate/exception/MinimumPeriodNotMetException';

export class BlindDateAvailableRequest {
  private readonly expiredDate: Date;
  private readonly maxSessionMemberCount: number;

  constructor(expiredDate: Date, maxSessionMemberCount: number) {
    // 이벤트 만료 시간이 지금이거나 과거인 경우 종료
    if (expiredDate.getTime() <= Date.now()) {
      throw new MinimumPeriodNotMetException(expiredDate);
    }

    this.expiredDate = expiredDate;
    this.maxSessionMemberCount = maxSessionMemberCount;
  }

  public getExpiredDate() {
    return this.expiredDate;
  }

  public getMaxSessionMemberCount() {
    return this.maxSessionMemberCount;
  }
}
