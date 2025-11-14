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

  public async getSocketIdByMemberId(sessionId: string, targetId: number) {
    return await this.sessionRepository.getSocketIdByMemberId(
      sessionId,
      targetId,
    );
  }

  public async getName(sessionId: string, memberId: number) {
    const name = await this.sessionRepository.getName(sessionId, memberId);
    if (!name) {
      throw new Error(`Unable to get member '${memberId}'`);
    }

    return name;
  }

  public async leave(socketId: string) {
    const sessionId =
      await this.sessionRepository.getSessionIdBySocketId(socketId);

    if (!sessionId) {
      console.log(`Unable to leave '${socketId}'`);
      return;
    }

    await this.sessionRepository.leave(sessionId, socketId);
  }

  public getNotMatched(sessionId: string) {
    return this.sessionRepository.getNotMatched(sessionId);
  }

  public async getAllMembers(sessionId: string): Promise<[number, string][]> {
    const participants =
      await this.sessionRepository.getParticipants(sessionId);

    return participants.reduce<[number, string][]>((acc, cur) => {
      acc.push([cur.getMemberId(), cur.getName()]);
      return acc;
    }, []);
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
