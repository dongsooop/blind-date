import {
  SESSION_STATE,
  SESSION_STATE_TYPE,
} from '@/session/const/session.constant';

export default class Session {
  private readonly volunteer: number;
  private state: SESSION_STATE_TYPE;
  private nameCounter: number;

  constructor({
    volunteer,
    state,
    nameCounter,
  }: {
    volunteer: number;
    state: SESSION_STATE_TYPE;
    nameCounter: number;
  }) {
    this.volunteer = volunteer || 0;
    this.state = state || SESSION_STATE.WAITING;
    this.nameCounter = nameCounter || 1;
  }

  public getVolunteer() {
    return this.volunteer;
  }

  public terminate() {
    this.state = SESSION_STATE.ENDED;
  }

  public isWaiting() {
    return this.state === SESSION_STATE.WAITING;
  }

  public isTerminated() {
    return this.state === SESSION_STATE.ENDED;
  }
}
