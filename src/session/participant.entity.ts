export class Participant {
  private readonly memberId: number;
  private readonly socketIdSet: Set<string>;
  private readonly name: string;

  constructor(memberId: number, socketIdSet: Set<string>, name: string) {
    this.memberId = memberId;
    this.socketIdSet = socketIdSet;
    this.name = name;
  }

  public hasSocketId(socketId: string) {
    return this.socketIdSet.has(socketId);
  }

  public removeSocketId(socketId: string) {
    this.socketIdSet.delete(socketId);
  }

  public equalsMemberId(memberId: number) {
    return this.memberId === memberId;
  }

  public addSocketId(socketId: string) {
    this.socketIdSet.add(socketId);
  }

  public getMemberId() {
    return this.memberId;
  }

  public getSocketIdSet() {
    return this.socketIdSet;
  }

  public getName() {
    return this.name;
  }
}
