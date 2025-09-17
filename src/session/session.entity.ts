import { SESSION_STATE, SESSION_STATE_TYPE } from '@/session/session.constant';
import { MemberIdNotAvailableException } from '@/blinddate/exception/MemberIdNotAvailableException';

export default class Session {
  private readonly id: string;
  private volunteer: number = 0;
  private readonly nameMap: Map<number, string> = new Map();
  private readonly socketMap: Map<number, string> = new Map();
  private state: SESSION_STATE_TYPE = SESSION_STATE.WAITING;
  private nameCounter = 1;
  private voteMap: Map<number, Set<number>> = new Map();
  private matched: Set<number> = new Set();

  public constructor(id: string) {
    this.id = id;
  }

  public getMemberName(id: number): string {
    const name = this.nameMap.get(id);
    if (name === undefined) {
      throw new Error(`Unable to get member '${id}'`);
    }

    return name;
  }

  public getVolunteer() {
    return this.volunteer;
  }

  public addMember(memberId: number, socketId: string) {
    if (this.socketMap.has(memberId)) {
      this.updateSocket(memberId, socketId);
      return;
    }

    this.volunteer++;
    this.nameMap.set(memberId, `동냥이${this.nameCounter++}`);
    this.socketMap.set(memberId, socketId);
  }

  public vote(voterId: number, targetId: number) {
    const targetsVoters = this.voteMap.get(targetId) || new Set();
    targetsVoters.add(voterId);

    this.voteMap.set(targetId, targetsVoters);

    // 상대가 날 선택했을 때
    const voter = this.voteMap.get(voterId);
    if (this.matched.has(targetId) || !voter || !voter.has(targetId)) {
      return false;
    }

    this.matched.add(voterId);
    this.matched.add(targetId);
    return true;
  }

  private updateSocket(memberId: number, socketId: string) {
    // 등록되지 않은 사용자는 소켓 업데이트가 불가능
    if (!this.socketMap.has(memberId)) {
      throw new MemberIdNotAvailableException();
    }
    this.socketMap.set(memberId, socketId);
  }

  public getAllMember() {
    return Array.from(this.nameMap.entries());
  }

  public start() {
    this.state = SESSION_STATE.PROCESSING;
  }

  public terminate() {
    this.state = SESSION_STATE.ENDED;
  }

  public isWaiting() {
    return this.state === SESSION_STATE.WAITING;
  }

  public getSocketIdByMemberId(memberId: number) {
    const socketId = this.socketMap.get(memberId);
    if (!socketId) {
      throw new MemberIdNotAvailableException();
    }

    return socketId;
  }

  public getNotMatched() {
    return Array.from(this.nameMap.entries())
      .filter((entry) => !this.matched.has(entry[0]))
      .map((entry) => entry[0]);
  }
}
