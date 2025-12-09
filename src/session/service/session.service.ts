import { Injectable } from '@nestjs/common';
import { SessionRepository } from '@/session/repository/session.repository';
import { SessionIdNotFoundException } from '@/blinddate/exception/SessionIdNotFoundException';
import { SESSION_STATE } from '@/session/const/session.constant';
import { SessionKeyFactory } from '@/session/repository/session-key.factory';

@Injectable()
export class SessionService {
  constructor(private readonly sessionRepository: SessionRepository) {}

  public async terminate(sessionId: string) {
    await this.sessionRepository.terminate(sessionId);
  }

  public async choice(sessionId: string, choicerId: number, targetId: number) {
    if (sessionId === null) {
      throw new SessionIdNotFoundException();
    }

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

  public async leave(memberId: number) {
    const sessionId =
      await this.sessionRepository.getSessionIdByMemberId(memberId);

    if (sessionId === null) {
      throw new SessionIdNotFoundException();
    }

    return this.sessionRepository.leave(sessionId, memberId);
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
    return await this.sessionRepository.addMember(
      sessionId,
      memberId,
      socketId,
    );
  }

  public async isSessionTerminated(sessionId: string) {
    const sessionKey = SessionKeyFactory.getSessionKey(sessionId);
    const status = await this.sessionRepository.getSessionStatus(sessionKey);
    return !status || status === SESSION_STATE.ENDED;
  }
}
