export class Broadcast {
  public message: string;
  public memberId: number;
  public name: string;
  public sendAt: Date;

  constructor(message: string, memberId: number, name: string, sendAt: Date) {
    this.message = message;
    this.memberId = memberId;
    this.name = name;
    this.sendAt = new Date(sendAt.getTime() + 9 * 60 * 60 * 1000);
  }
}
