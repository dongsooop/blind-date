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

  public async leave(sessionIds: Set<string>, socketId: string) {
    await this.sessionRepository.leave(sessionIds, socketId);
  }

  public getNotMatched(sessionId: string) {
    return this.sessionRepository.getNotMatched(sessionId);
  }

  public async getAllMembersSocket(sessionId: string): Promise<string[]> {
    const allMembersSocket =
      await this.sessionRepository.getAllMembers(sessionId);
    console.log(allMembersSocket);

    return [...allMembersSocket.values()].flatMap((v) => [...v]);
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
