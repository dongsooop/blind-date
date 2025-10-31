export class Broadcast {
  public message: string;
  public memberId: number;
  public name: string;
  public sendAt: string;

  constructor(message: string, memberId: number, name: string, sendAt: Date) {
    this.message = message;
    this.memberId = memberId;
    this.name = name;
    this.sendAt = sendAt.toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
    });
  }
}
