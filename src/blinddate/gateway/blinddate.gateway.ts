import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { SessionIdNotFoundException } from '@/blinddate/exception/SessionIdNotFoundException';
import { BlindDateMessage } from '@/blinddate/message/BlindDateMessage';
import { EVENT_TYPE } from '@/blinddate/constant/blinddate.event.type';
import { Broadcast } from '@/blinddate/constant/Broadcast';
import Session from '@/session/session.entity';
import { MemberIdNotAvailableException } from '@/blinddate/exception/MemberIdNotAvailableException';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@WebSocketGateway({
  namespace: 'blinddate',
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
})
export class BlindDateGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private readonly JOINED_EVENT_NAME = 'joined';
  private readonly START_EVENT_NAME = 'start';
  private readonly MATCHING_ROOM_ID = 'MATCHING';
  private readonly MAX_SESSION_MEMBER_COUNT = 2;
  private readonly EVENT_MESSAGE_AMOUNT = 3;

  private pointer: string = this.MATCHING_ROOM_ID;
  private sessionMap: Map<string, Session> = new Map();

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly blindDateMessage: BlindDateMessage,
    private readonly httpService: HttpService,
  ) {}

  afterInit() {
    console.log('WebSocket Gateway Initialized');
  }

  /**
   * 소켓 연결
   * @param client 사용자 소켓
   */
  async handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);

    if (typeof client.handshake.query.sessionId !== 'string') {
      throw new SessionIdNotFoundException();
    }
    const sessionId: string = this.assignSession(
      client.handshake.query.sessionId,
    );
    // 새 세션 입장
    await client.join(this.pointer);

    // 매칭된 방
    const session = this.sessionMap.get(sessionId);
    if (session === undefined) {
      throw new SessionIdNotFoundException();
    }

    // 회원 ID
    const memberId = Number(client.handshake.query.memberId);
    if (isNaN(memberId)) {
      throw new MemberIdNotAvailableException();
    }

    // 세션에 회원 추가
    session.addMember(memberId);

    // 회원 닉네임
    const name = session.getMemberName(Number(memberId));
    client.emit('name', name);

    // 참여자 수
    const volunteer = session.getVolunteer();

    // 방 인원 업데이트 이벤트 발행
    this.updateSessionVolunteer(this.pointer, volunteer);

    // 현재 사용자가 마지막 참여자가 아닐때 종료
    if (volunteer < this.MAX_SESSION_MEMBER_COUNT) {
      return;
    }

    // 마지막 참여자일 경우
    this.emitStartEvent(sessionId); // 과팅 시작 이벤트 발행

    // 시작 전 안내 멘트 전송
    this.blindDateMessage.getStartMessage().forEach((message) => {
      this.server
        .to(sessionId)
        .emit(
          EVENT_TYPE.SYSTEM,
          new Broadcast(message, 0, '동냥이', new Date()),
        );
    });

    // 시간별로 이벤트 메시지 전송
    await this.sendEventMessage(sessionId, memberId, name);
    this.server.to(sessionId).emit('participants', session.getAllMember());
  }

  private async sendEventMessage(
    sessionId: string,
    memberId: number,
    name: string,
  ) {
    for (const message of this.blindDateMessage.getEventMessage(
      this.EVENT_MESSAGE_AMOUNT,
    )) {
      this.server.to(sessionId).emit(EVENT_TYPE.FREEZE);
      this.server
        .to(sessionId)
        .emit(
          EVENT_TYPE.SYSTEM,
          new Broadcast(message, memberId, name, new Date()),
        );

      // 메시지 전달 후 채팅 활성화
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          this.server.to(sessionId).emit(EVENT_TYPE.THAW);
          resolve();
        }, 2000);
      });

      // 사용자 채팅 시간 주기
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 180000);
      });
    }
  }

  /**
   * 세션 배정
   * @param sessionId
   * @private
   */
  private assignSession(sessionId: string) {
    if (sessionId === undefined || sessionId === null) {
      throw new SessionIdNotFoundException();
    }

    // pointer가 가리키는 세션이 없을 때
    if (this.pointer === this.MATCHING_ROOM_ID) {
      return this.createNewSession();
    }

    // pointer가 가리키는 세션의 인원수가 찼을 때
    const volunteer = this.sessionMap.get(this.pointer)?.getVolunteer() || 0;
    if (volunteer >= this.MAX_SESSION_MEMBER_COUNT) {
      return this.createNewSession();
    }

    return this.pointer;
  }

  /**
   * 세션 생성
   * @private
   */
  private createNewSession(): string {
    const sessionId = randomUUID();
    this.pointer = sessionId;
    this.sessionMap.set(sessionId, new Session(sessionId));

    return sessionId;
  }

  private getVolunteer(sessionId: string): number {
    const volunteer: number | undefined = this.sessionMap
      .get(sessionId)
      ?.getVolunteer();

    if (volunteer === undefined) {
      return 0;
    }

    return volunteer;
  }

  private emitStartEvent(sessionId: string) {
    this.server.to(sessionId).emit(this.START_EVENT_NAME, {
      sessionId,
    });
  }

  private updateSessionVolunteer(sessionId: string, volunteer: number): void {
    this.server.to(sessionId).emit(this.JOINED_EVENT_NAME, {
      sessionId,
      volunteer,
    });
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('message')
  handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { sessionId: string; message: string; senderId: number },
  ) {
    const session = this.getSession(data.sessionId);

    this.server
      .to(data.sessionId)
      .emit(
        'broadcast',
        new Broadcast(
          data.message,
          data.senderId,
          session.getMemberName(data.senderId),
          new Date(),
        ),
      );
  }

  @SubscribeMessage('choice')
  async handleVote(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      sessionId: string;
      choicerId: number;
      targetId: number;
      choicerToken: string;
    },
  ) {
    const session = this.getSession(data.sessionId);

    // 매칭 성공 시
    const voteResult = session.vote(data.choicerId, data.targetId);
    if (voteResult) {
      const requestHeader = {
        headers: { Authorization: `Bearer ${data.choicerToken}` },
      };
      const requestBody = {
        targetUserId: data.targetId,
        title: `[과팅] ${new Date().toISOString().slice(0, 10)}`,
      };
      const url = `https://${process.env.SERVER_DOMAIN}${process.env.CREATE_CHATROOM_API}`;

      // 채팅방 생성
      await firstValueFrom(
        this.httpService.post(url, requestBody, requestHeader),
      );
    }
  }

  private getSession(sessionId: string) {
    const session = this.sessionMap.get(sessionId);
    if (!session) {
      throw new SessionIdNotFoundException();
    }

    return session;
  }
}
