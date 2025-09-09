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
import { UseFilters } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SESSION_STATE } from '@/session/session.constant';
import Session from '@/session/session.entity';
import { SocketId } from 'socket.io-adapter/dist/in-memory-adapter';
import { SessionNotAvailableException } from '@/blinddate/exception/SessionNotAvailableException';
import { SessionIdNotFoundException } from '@/blinddate/exception/SessionIdNotFoundException';

@WebSocketGateway({
  namespace: 'rooms',
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

  // private session: Session[] = [];
  private pointer: string = this.MATCHING_ROOM_ID;

  @WebSocketServer()
  server: Server;

  constructor() {}

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

      const volunteer = this.getVolunteer(this.pointer);

      // 방 인원 업데이트 이벤트 발행
      this.updateSessionVolunteer(this.pointer, volunteer);

      // 현재 사용자가 마지막 참여자일때
      if (volunteer === this.MAX_SESSION_MEMBER_COUNT) {
        this.pointer = randomUUID(); // 다음 사용자를 위해 pointer 새로 발급
        this.emitStartEvent(this.pointer); // 과팅 시작 이벤트 발행
      }
    }
  }

  private getVolunteer(sessionId: string): number {
    const room: Set<string> | undefined =
      this.server.sockets.adapter.rooms.get(sessionId);
    if (room === undefined) {
      return 0;
    }

    return room.size;
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

  async handleDisconnect(client: Socket) {}
}
