import { SESSION_STATE } from '@/session/session.constant';

export default class Session {
  private readonly id: string;
  private volunteer: number = 0;
  private readonly nameMap: Map<number, string> = new Map();
  private readonly state = SESSION_STATE.WAITING;
  private nameCounter = 1;
  private voteMap: Map<number, Set<number>> = new Map();

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

  public addMember(memberId: number) {
    this.volunteer++;
    this.nameMap.set(memberId, `동냥이${this.nameCounter++}`);
  }

  public vote(voterId: number, targetId: number) {
    const targetsVoters = this.voteMap.get(targetId);
    if (targetsVoters !== undefined) {
      targetsVoters.add(voterId);
    }

    // 상대가 날 선택했을 때
    const voter = this.voteMap.get(voterId);
    return voter !== undefined && voter.has(voterId);
  }

  public getAllMember() {
    return Array.from(this.nameMap.entries());
  }
}
