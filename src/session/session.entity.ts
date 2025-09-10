import { SESSION_STATE } from '@/session/session.constant';

export default class Session {
  private readonly id: string;
  private volunteer: number = 0;
  private readonly nameMap: Map<number, string> = new Map();
  private readonly state = SESSION_STATE.WAITING;
  private nameCounter = 1;

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
}
