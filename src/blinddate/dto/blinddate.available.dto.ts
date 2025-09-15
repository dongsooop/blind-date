export class BlindDateAvailableRequest {
  private readonly expiredDate: Date;
  private readonly maxSessionMemberCount: number;

  constructor(expiredDate: Date, maxSessionMemberCount: number) {
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
