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
import { BlindDateMessage } from '@/blinddate/message/BlindDateMessage';
import { EVENT_TYPE } from '@/blinddate/constant/blinddate.event.type';
import { Broadcast } from '@/blinddate/constant/Broadcast';
import Session from '@/session/entity/session.entity';
import { MemberIdNotAvailableException } from '@/blinddate/exception/MemberIdNotAvailableException';
import { BlindDateService } from '@/blinddate/service/blinddate.service';
import { CustomWsExceptionFilter } from '@/exception-filter/websocket.exception.filter';
import { UseFilters } from '@nestjs/common';
import { SessionService } from '@/session/service/session.service';

@UseFilters(CustomWsExceptionFilter)
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
  @WebSocketServer()
  server: Server;
  private readonly MATCHING_ROOM_ID = 'MATCHING';
  private readonly EVENT_MESSAGE_AMOUNT = 3;
  private sessionMap: Map<string, Session> = new Map();

  constructor(
    private readonly blindDateMessage: BlindDateMessage,
    private readonly blindDateService: BlindDateService,
    private readonly sessionService: SessionService,
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

    const isAvailable = await this.blindDateService.isAvailable();
    if (!isAvailable) {
      console.log(`Blinddate service not available: ${client.id}`);
      client.disconnect();
      return;
    }

    // 적절한 repository ID 할당
    const sessionId: string = await this.blindDateService.assignSession(
      client.handshake.query.sessionId,
    );

    // 매칭된 방
    const session: Session = await this.sessionService.getSession(sessionId);

    // 종료된 방이면 종료
    if (session.isTerminated()) {
      return;
    }

    // 세션 구독
    await client.join(sessionId);

    // 회원 ID
    const memberId = Number(client.handshake.query.memberId);
    if (isNaN(memberId)) {
      throw new MemberIdNotAvailableException();
    }

    // 세션에 회원 추가
    await this.sessionService.addMember(sessionId, memberId, client.id);

    // 대기중인 방이 아닌 경우 재입장으로 간주하고 종료
    if (!session.isWaiting()) {
      return;
    }

    // 회원 닉네임
    const name = await this.sessionService.getName(sessionId, Number(memberId));
    client.emit(EVENT_TYPE.JOIN, { name, sessionId });

    // 참여자 수
    const volunteer = session.getVolunteer() + 1;

    // 방 인원 업데이트 이벤트 발행
    this.updateSessionVolunteer(sessionId, volunteer);

    // 현재 사용자가 마지막 참여자가 아닐때 종료
    const memberCount = await this.blindDateService.getMaxSessionMemberCount();
    if (volunteer < memberCount) {
      return;
    }

    // 마지막 참여자일 경우
    this.emitStartEvent(sessionId); // 과팅 시작 이벤트 발행
    await this.sessionService.start(sessionId);
    this.server.to(sessionId).emit(EVENT_TYPE.FREEZE);

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
    await this.sendEventMessage(sessionId);

    const participants = await this.sessionService.getAllMembers(sessionId);
    this.server.to(sessionId).emit('participants', participants);

    // 10초 선택시간 + 2초간 늦은 요청 처리를 위해 대기
    await new Promise<void>((resolve) => setTimeout(resolve, 12000));

    const notMatchedUserSocket =
      await this.sessionService.getNotMatched(sessionId);

    this.server.to(notMatchedUserSocket).emit('failed');

    await this.sessionService.terminate(sessionId);
  }

  async handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    const sessionIds: Set<string> = client.rooms;

    await this.sessionService.leave(sessionIds, client.id);
  }

  private async sendEventMessage(sessionId: string) {
    for (const message of this.blindDateMessage.getEventMessage(
      this.EVENT_MESSAGE_AMOUNT,
    )) {
      this.server.to(sessionId).emit(EVENT_TYPE.FREEZE);
      this.server
        .to(sessionId)
        .emit(
          EVENT_TYPE.SYSTEM,
          new Broadcast(message, 0, '동냥이', new Date()),
        );

      // 메시지 전달 후 채팅 활성화
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          this.server.to(sessionId).emit(EVENT_TYPE.THAW);
          resolve();
        }, 5000); // 5초 후 시작
      });

      // 사용자 채팅 시간 주기
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 180000); // 3분
      });
    }
  }

  private getVolunteer(sessionId: string): number {
    const volunteer: number | undefined = this.sessionMap
      .get(sessionId)
      ?.getVolunteer();

    return volunteer ?? 0;
  }

  private emitStartEvent(sessionId: string) {
    this.server.to(sessionId).emit(EVENT_TYPE.START, {
      sessionId,
    });
  }

  private updateSessionVolunteer(sessionId: string, volunteer: number): void {
    this.server.to(sessionId).emit(EVENT_TYPE.JOINED, {
      sessionId,
      volunteer,
    });
  }

  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { sessionId: string; message: string; senderId: number },
  ) {
    console.log(
      `${new Date().toISOString()}: Received message from client: ${client.id}`,
    );

    const name = await this.sessionService.getName(
      data.sessionId,
      data.senderId,
    );

    this.server
      .to(data.sessionId)
      .emit(
        EVENT_TYPE.BROADCAST,
        new Broadcast(data.message, data.senderId, name, new Date()),
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
    },
  ) {
    console.log(
      `Received choice from client: ${data.choicerId}, and targetId: ${data.targetId}`,
    );

    const targetSocketId = await this.sessionService.getSocketIdByMemberId(
      data.sessionId,
      data.targetId,
    );

    if (!targetSocketId) {
      return;
    }

    const createdRoomId = await this.blindDateService.choice(data);
    if (createdRoomId === null || createdRoomId === undefined) {
      return;
    }

    this.server.to(client.id).emit(EVENT_TYPE.CREATE_CHATROOM, createdRoomId);
    this.server
      .to(targetSocketId)
      .emit(EVENT_TYPE.CREATE_CHATROOM, createdRoomId);
  }
}
