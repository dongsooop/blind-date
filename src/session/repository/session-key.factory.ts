export class SessionKeyFactory {
  private static readonly PREFIX = 'blinddate';

  /**
   * 세션 키
   * sessionId: { participants: [{ memberId, [socketId], name }, ...], state: , nameCounter: 1 }
   *
   * @param sessionId
   */
  public static getSessionKey(sessionId: string) {
    return `${this.PREFIX}-session-${sessionId}`;
  }

  public static getParticipantsKey(sessionId: string) {
    return `${this.PREFIX}-participants-${sessionId}`;
  }

  /**
   * 회원 키
   * memberId: { socket: [1], session: 1, name: '익명1' }
   *
   * @param memberId
   */
  public static getMemberKey(memberId: number) {
    return `${this.PREFIX}-member-${memberId}`;
  }

  /**
   * 회원 소켓 목록 키
   * [ socketId, socketId ]
   *
   * @param memberId
   */
  public static getMemberSocketKey(memberId: number) {
    return `${this.PREFIX}-member-socket-${memberId}`;
  }

  public static getChoiceKeyName(sessionId: string) {
    return `${this.PREFIX}-choice-${sessionId}`;
  }

  public static getMatchesKeyName(sessionId: string) {
    return `${this.PREFIX}-matches-${sessionId}`;
  }

  /**
   * 포인터 키
   */
  public static getPointerKeyName() {
    return `${this.PREFIX}-pointer`;
  }

  /**
   * 회원 키
   * socketId: { member: 1, session: 1, name: '익명1' }
   *
   * @param socketId
   */
  public static getSocketKey(socketId: string) {
    return `${this.PREFIX}-socket-${socketId}`;
  }
}
