import { Injectable } from '@nestjs/common';
import { SessionRepository } from '@/session/repository/session.repository';

@Injectable()
export class SessionService {
  constructor(private readonly sessionRepository: SessionRepository) {}

  public async terminate(sessionId: string) {
    await this.sessionRepository.terminate(sessionId);
  }

  public async choice(sessionId: string, choicerId: number, targetId: number) {
    return (
      (await this.sessionRepository.choice(sessionId, choicerId, targetId)) ??
      false
    );
  }

  public async getName(sessionId: string, memberId: number) {
    const name = await this.sessionRepository.getName(memberId);
    if (!name) {
      throw new Error(`Unable to get member '${memberId}'`);
    }

    return name;
  }

  public async leave(sessionId: string, memberId: number) {
    await this.sessionRepository.leave(sessionId, memberId);
  }

  public getNotMatched(sessionId: string) {
    return this.sessionRepository.getNotMatched(sessionId);
  }

  public getAllMembers(sessionId: string): Promise<[number, string][]> {
    return this.sessionRepository.getParticipantsIdAndName(sessionId);
  }

  public async start(sessionId: string) {
    await this.sessionRepository.start(sessionId);
  }

  public async addMember(
    sessionId: string,
    memberId: number,
    socketId: string,
  ) {
    await this.sessionRepository.addMember(sessionId, memberId, socketId);
  }

  public getSession(sessionId: string) {
    return this.sessionRepository.getSession(sessionId);
  }
}
