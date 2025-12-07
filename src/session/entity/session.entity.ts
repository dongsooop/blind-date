import {
  SESSION_STATE,
  SESSION_STATE_TYPE,
} from '@/session/const/session.constant';

export default class Session {
  private readonly participants: string[];
  private readonly state: SESSION_STATE_TYPE;
  private readonly nameCounter: number;

  constructor({
    participants,
    state,
    nameCounter,
  }: {
    participants: string[];
    state: SESSION_STATE_TYPE;
    nameCounter: number;
  }) {
    this.participants = participants || [];
    this.state = state || SESSION_STATE.WAITING;
    this.nameCounter = nameCounter || 1;
  }

  public getParticipants() {
    return this.participants;
  }

  public isWaiting() {
    return this.state === SESSION_STATE.WAITING;
  }

  public isTerminated() {
    return this.state === SESSION_STATE.ENDED;
  }
}
