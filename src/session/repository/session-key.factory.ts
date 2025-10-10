export class SessionKeyFactory {
  private static readonly PREFIX = 'blinddate';

  public static getNameKeys(sessionId: string) {
    return `${this.PREFIX}-name-map-${sessionId}`;
  }

  public static getClientsKeyName(sessionId: string) {
    return `${this.PREFIX}-clients-${sessionId}`;
  }

  public static getSessionKeyName(sessionId: string) {
    return `${this.PREFIX}-${sessionId}`;
  }

  public static getSocketKeyName(sessionId: string) {
    return `${this.PREFIX}-socket-${sessionId}`;
  }

  public static getChoiceKeyName(sessionId: string) {
    return `${this.PREFIX}-choice-${sessionId}`;
  }

  public static getMatchesKeyName(sessionId: string) {
    return `${this.PREFIX}-matches-${sessionId}`;
  }

  public static getPointerKeyName() {
    return '${this.PREFIX}-pointer';
  }
}
