export class Broadcast {
  public message: string;
  public memberId: number;
  public name: string;
  public sendAt: string;

  constructor(message: string, memberId: number, name: string, sendAt: string) {
    this.message = message;
    this.memberId = memberId;
    this.name = name;
    this.sendAt = sendAt;
  }
}
