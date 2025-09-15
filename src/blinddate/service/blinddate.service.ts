import nodeCron from 'node-cron';

export class BlindDateService {
  private status = false;

  public availableBlindDate(expiredDate: Date) {
    this.status = true;

    const expiredMinute = expiredDate.getMinutes();
    const expiredHour = expiredDate.getHours();
    const expiredDay = expiredDate.getDate();
    const expiredMonth = expiredDate.getMonth();
    const expression = `0 ${expiredMinute} ${expiredHour} ${expiredDay} ${expiredMonth + 1} * *`;

    nodeCron.schedule(expression, () => {
      this.status = false;
    });
  }

  public isAvailable(): boolean {
    return this.status;
  }
}
