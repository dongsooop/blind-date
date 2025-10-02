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
import { SessionIdNotFoundException } from '@/blinddate/exception/SessionIdNotFoundException';
import { BlindDateMessage } from '@/blinddate/message/BlindDateMessage';
import { EVENT_TYPE } from '@/blinddate/constant/blinddate.event.type';
import { Broadcast } from '@/blinddate/constant/Broadcast';
import Session from '@/session/entity/session.entity';
import { MemberIdNotAvailableException } from '@/blinddate/exception/MemberIdNotAvailableException';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { BlindDateService } from '@/blinddate/service/blinddate.service';
import { SessionRepository } from '@/session/repository/session.repository';
import { CustomWsExceptionFilter } from '@/exception-filter/websocket.exception.filter';
import { UseFilters } from '@nestjs/common';

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
    private readonly httpService: HttpService,
    private readonly blindDateService: BlindDateService,
    private readonly sessionRepository: SessionRepository,
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
    }

    // 적절한 repository ID 할당
    const sessionId: string = await this.assignSession(
      client.handshake.query.sessionId,
    );

    // 매칭된 방
    const session: Session = await this.sessionRepository.getSession(sessionId);

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
    await this.sessionRepository.addMember(sessionId, memberId, client.id);

    // 대기중인 방이 아닌 경우 재입장으로 간주하고 종료
    if (!session.isWaiting()) {
      return;
    }

    // 회원 닉네임
    const name = await this.sessionRepository.getName(
      sessionId,
      Number(memberId),
    );
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
    await this.sessionRepository.start(sessionId);
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

    const participants = await this.sessionRepository.getAllMembers(sessionId);
    this.server.to(sessionId).emit('participants', participants);

    await new Promise<void>((resolve) => setTimeout(resolve, 12000));

    const notMatchedUserSocket =
      await this.sessionRepository.getNotMatched(sessionId);

    for (const socketId of notMatchedUserSocket) {
      if (!socketId) {
        return;
      }

      this.server.to(socketId).emit('failed');
    }

    await this.sessionRepository.terminate(sessionId);
    await this.sessionRepository.initPointer();
  }

  async handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    const sessionIds: Set<string> = client.rooms;

    await this.sessionRepository.leave(sessionIds, client.id);
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
        }, 5000); // 5초
        // }, 180000);
      });
    }
  }

  /**
   * 세션 배정
   * @param sessionId
   * @private
   */
  private async assignSession(sessionId: string | string[] | undefined) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new SessionIdNotFoundException();
    }

    // 재연결일 때
    if (sessionId !== this.MATCHING_ROOM_ID) {
      return sessionId;
    }

    const pointer = await this.sessionRepository.getPointer();

    // pointer가 가리키는 세션이 없을 때
    if (pointer === null) {
      const newPointer = await this.sessionRepository.create();
      await this.sessionRepository.setPointer(newPointer);
      return newPointer;
    }

    // pointer가 가리키는 세션의 인원수가 찼을 때
    const volunteer =
      (await this.sessionRepository.getSession(pointer)).getVolunteer() || 0;
    const memberCount = await this.blindDateService.getMaxSessionMemberCount();
    if (volunteer >= memberCount) {
      const newPointer = await this.sessionRepository.create();
      await this.sessionRepository.setPointer(newPointer);
      return newPointer;
    }

    return pointer;
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

    this.server
      .to(data.sessionId)
      .emit(
        EVENT_TYPE.BROADCAST,
        new Broadcast(
          data.message,
          data.senderId,
          await this.sessionRepository.getName(data.sessionId, data.senderId),
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
    console.log(
      `Received choice from client: ${data.choicerId}, and targetId: ${data.targetId}`,
    );

    const voteResult = await this.sessionRepository.choice(
      data.sessionId,
      data.choicerId,
      data.targetId,
    );

    // 매칭 실패 시
    if (!voteResult) {
      console.log('failed');
      return;
    }

    // 매칭 성공 시
    console.log(`matching success! ${data.choicerId} + ${data.targetId}`);
    const response = await this.requestToCreateChatRoom(
      data.choicerId,
      data.targetId,
    );

    const createdRoomId: string = (response.data as { roomId: string }).roomId;
    if (!createdRoomId) {
      throw new Error('방이 생성되지 않았습니다.');
    }
    this.server.to(client.id).emit(EVENT_TYPE.CREATE_CHATROOM, createdRoomId);

    const targetSocketId = await this.sessionRepository.getSocketIdByMemberId(
      data.sessionId,
      data.targetId,
    );
    if (!targetSocketId) {
      return;
    }
    this.server
      .to(targetSocketId)
      .emit(EVENT_TYPE.CREATE_CHATROOM, createdRoomId);
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
}
