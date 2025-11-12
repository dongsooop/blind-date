export class Participant {
  private readonly memberId: number;
  private readonly name: string;

  private socketIds: string[];

  constructor(memberId: number, socketIds: string[], name: string) {
    this.memberId = memberId;
    this.name = name;
    this.socketIds = socketIds;
  }

  public hasSocketId(socketId: string) {
    return this.socketIds.includes(socketId);
  }

  public removeSocketId(socketId: string) {
    this.socketIds = this.socketIds.filter((id) => id !== socketId);
  }

  public equalsMemberId(memberId: number) {
    return this.memberId === memberId;
  }

  public addSocketId(socketId: string) {
    this.socketIds.push(socketId);
  }

  public getMemberId() {
    return this.memberId;
  }

  public getSocketIds() {
    return this.socketIds;
  }

  public getName() {
    return this.name;
  }
}
