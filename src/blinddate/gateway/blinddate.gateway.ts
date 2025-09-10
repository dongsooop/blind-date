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
  private readonly MAX_SESSION_MEMBER_COUNT = 7;
  private readonly EVENT_MESSAGE_AMOUNT = 3;

  // private session: Session[] = [];
  private pointer: string = this.MATCHING_ROOM_ID;
  private volunteer: Map<string, number> = new Map();

  @WebSocketServer()
  server: Server;

  constructor(private readonly blindDateMessage: BlindDateMessage) {}

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
    const sessionId: string = client.handshake.query.sessionId;

    // 매칭 연결 시 방 배정
    if (sessionId === this.MATCHING_ROOM_ID) {
      // 설정된 방이 없거나, 꽉찼을 때 pointer update
      if (
        this.pointer === this.MATCHING_ROOM_ID ||
        this.getVolunteer(this.pointer) >= this.MAX_SESSION_MEMBER_COUNT
      ) {
        this.pointer = randomUUID();
      }

      // 새 세션 입장
      await client.join(this.pointer);
    }

    // 매칭된 방
    const volunteer = this.getVolunteer(this.pointer) + 1;
    this.volunteer.set(this.pointer, volunteer);

    // 방 인원 업데이트 이벤트 발행
    this.updateSessionVolunteer(this.pointer, volunteer);

    // 현재 사용자가 마지막 참여자일때
    if (volunteer === this.MAX_SESSION_MEMBER_COUNT) {
      const sessionId: string = this.pointer;
      this.pointer = randomUUID(); // 다음 사용자를 위해 pointer 새로 발급
      this.emitStartEvent(sessionId); // 과팅 시작 이벤트 발행
      this.blindDateMessage.getStartMessage().forEach((message) => {
        this.server.to(sessionId).emit('message', message);
      });

      for (const message of this.blindDateMessage.getEventMessage(
        this.EVENT_MESSAGE_AMOUNT,
      )) {
        this.server.to(sessionId).emit('freeze');
        this.server.to(sessionId).emit('message', message);

        // 메시지 전달 후 채팅 활성화
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            this.server.to(sessionId).emit('thaw');
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
  }

  private getVolunteer(sessionId: string): number {
    const volunteer: number | undefined = this.volunteer.get(sessionId);
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
    @MessageBody() data: { sessionId: string; message: string },
  ) {
    this.server.to(data.sessionId).emit('broadcast', data.message);
  }
}
