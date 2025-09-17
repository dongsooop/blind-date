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
import { BlindDateService } from '@/blinddate/service/blinddate.service';

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
  private readonly JOIN_EVENT_NAME = 'join';
  private readonly START_EVENT_NAME = 'start';
  private readonly MATCHING_ROOM_ID = 'MATCHING';
  private readonly EVENT_MESSAGE_AMOUNT = 3;

  private pointer: string = this.MATCHING_ROOM_ID;
  private sessionMap: Map<string, Session> = new Map();

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly blindDateMessage: BlindDateMessage,
    private readonly httpService: HttpService,
    private readonly blindDateService: BlindDateService,
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

    if (!this.blindDateService.isAvailable()) {
      console.log(`Blinddate service not available: ${client.id}`);
    }

    // 적절한 session ID 할당
    const sessionId: string = this.assignSession(
      client.handshake.query.sessionId,
    );

    // 세션 구독
    await client.join(sessionId);

    // 매칭된 방
    const session = this.sessionMap.get(sessionId);
    if (session === undefined) {
      throw new SessionIdNotFoundException();
    }

    // 대기중인 방이 아닌 경우
    if (!session.isWaiting()) {
      return;
    }

    // 회원 ID
    const memberId = Number(client.handshake.query.memberId);
    if (isNaN(memberId)) {
      throw new MemberIdNotAvailableException();
    }

    // 세션에 회원 추가
    session.addMember(memberId, client.id);

    // 회원 닉네임
    const name = session.getMemberName(Number(memberId));
    client.emit(this.JOIN_EVENT_NAME, { name, sessionId });

    // 참여자 수
    const volunteer = session.getVolunteer();

    // 방 인원 업데이트 이벤트 발행
    this.updateSessionVolunteer(this.pointer, volunteer);

    // 현재 사용자가 마지막 참여자가 아닐때 종료
    if (volunteer < this.blindDateService.getMaxSessionMemberCount()) {
      return;
    }

    // 마지막 참여자일 경우
    this.emitStartEvent(sessionId); // 과팅 시작 이벤트 발행
    session.start();
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

    this.server
      .to(sessionId)
      .emit(
        EVENT_TYPE.SYSTEM,
        new Broadcast(
          '자, 그러면 지금부터 시작하겠습니다!',
          0,
          '동냥이',
          new Date(),
        ),
      );

    // 시간별로 이벤트 메시지 전송
    await this.sendEventMessage(sessionId, memberId, name);
    this.server.to(sessionId).emit('participants', session.getAllMember());
    setTimeout(() => {
      const notMatchedUser = session.getNotMatched();
      notMatchedUser.forEach((id) => {
        this.server.to(session.getSocketIdByMemberId(id)).emit('failed');
      });
    }, 12000);
    session.terminate();
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
        }, 5000); // 5초 후 시작
      });

      // 사용자 채팅 시간 주기
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 60000); // 1분
        // }, 180000);
      });
    }
  }

  /**
   * 세션 배정
   * @param sessionId
   * @private
   */
  private assignSession(sessionId: string | string[] | undefined) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new SessionIdNotFoundException();
    }

    // 재연결일 때
    if (sessionId !== this.MATCHING_ROOM_ID) {
      return sessionId;
    }

    // pointer가 가리키는 세션이 없을 때
    if (this.pointer === this.MATCHING_ROOM_ID) {
      this.pointer = this.createNewSession();

      return this.pointer;
    }

    // pointer가 가리키는 세션의 인원수가 찼을 때
    const volunteer = this.sessionMap.get(this.pointer)?.getVolunteer() || 0;
    if (volunteer >= this.blindDateService.getMaxSessionMemberCount()) {
      this.pointer = this.createNewSession();
      return this.pointer;
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
    console.log(`Received message from client: ${client.id}`);
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
    },
  ) {
    const session = this.getSession(data.sessionId);
    console.log(
      `Received choice from client: ${data.choicerId}, and targetId: ${data.targetId}`,
    );

    // 매칭 성공 시
    const voteResult = session.vote(data.choicerId, data.targetId);
    if (voteResult) {
      const response = await this.requestToCreateChatRoom(
        data.choicerId,
        data.targetId,
      );

      const createdRoomId = response.data.roomId;
      if (!createdRoomId || typeof createdRoomId !== 'string') {
        throw new Error('방이 생성되지 않았습니다.');
      }

      const targetSocketId = session.getSocketIdByMemberId(data.targetId);
      this.server.to(client.id).emit(EVENT_TYPE.CREATE_CHATROOM, createdRoomId);
      this.server
        .to(targetSocketId)
        .emit(EVENT_TYPE.CREATE_CHATROOM, createdRoomId);
    }
  }

  private async requestToCreateChatRoom(
    sourceUserId: number,
    targetUserId: number,
  ) {
    const requestHeader = {
      headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
    };
    const requestBody = {
      sourceUserId,
      targetUserId,
      title: `[과팅] ${new Date().toISOString().slice(0, 10)}`,
    };
    const url = `https://${process.env.SERVER_DOMAIN}${process.env.CREATE_CHATROOM_API}`;

    // 채팅방 생성
    return await firstValueFrom(
      this.httpService.post(url, requestBody, requestHeader),
    );
  }

  private getSession(sessionId: string) {
    const session = this.sessionMap.get(sessionId);
    if (!session) {
      throw new SessionIdNotFoundException();
    }

    return session;
  }
}
