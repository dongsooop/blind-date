import { Inject, Injectable } from '@nestjs/common';
import { SessionService } from '@/session/service/session.service';
import type { RedisClientType } from 'redis';
import { REDIS_CLIENT } from '@/redis/redis.module';
import { BlindDateQueue, BlindDateQueueType } from '@/queue/blinddate.queue';
import { Server } from 'socket.io';
import { BlindDateService } from '@/blinddate/service/blinddate.service';
import { EVENT_TYPE } from '@/blinddate/constant/blinddate.event.type';
import { Broadcast } from '@/blinddate/constant/Broadcast';
import { BlindDateMessage } from '@/blinddate/message/BlindDateMessage';
import { JoinStatus } from '@/blinddate/constant/join.type';

type JobType = {
  type: BlindDateQueueType;
  timestamp: Date;
  memberId: number;
  socketId: string;
  targetId: number | null;
  sessionId: string | null;
};

@Injectable()
export class QueueConsumer {
  private server: Server;

  private readonly EVENT_MESSAGE_AMOUNT = 3;
  private readonly REDIS_KEY_PREFIX = 'blinddate';

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClientType,
    private readonly sessionService: SessionService,
    private readonly blindDateService: BlindDateService,
    private readonly blindDateMessage: BlindDateMessage,
  ) {}

  public initServer(server: Server) {
    this.server = server;
    this.start();
  }

  private async start() {
    console.log('[QueueConsumer] started');

    const subscriber = this.redisClient.duplicate();
    await subscriber.connect();

    await subscriber.subscribe('blinddate:queue:signal', async () => {
      while (true) {
        const job = await this.redisClient.rPop('blinddate:queue');
        if (!job) {
          // 더 이상 처리할 게 없으면 중단
          break;
        }
        await this.process(JSON.parse(job) as JobType);
      }
    });
  }

  private async process(job: JobType) {
    console.log(job);
    switch (job.type) {
      case BlindDateQueue.ENTER:
        return this.handleEnter(job.memberId, job.socketId);

      case BlindDateQueue.LEAVE:
        return this.handleLeave(job.memberId);

      case BlindDateQueue.CHOICE:
        if (!job.sessionId) {
          break;
        }
        return this.handleChoice(
          job.sessionId,
          job.memberId,
          job.targetId || 0,
        );
      default:
        console.warn('[QueueConsumer] Unknown job type:', job.type);
    }
  }

  private async handleEnter(memberId: number, socketId: string) {
    const { sessionId, joinStatus } =
      await this.blindDateService.assignSession(memberId);

    const result = await this.sessionService.addMember(
      sessionId,
      memberId,
      socketId,
    );

    if (!result) {
      console.error(
        '[QueueConsumer] Unknown sessionId or volunteerId is not set',
      );
      return;
    }

    console.log(`member(${memberId}) joined to session${sessionId}`);

    // 세션 구독
    const sockets = await this.server.fetchSockets();
    const socket = sockets.find((s) => s.id === socketId);
    if (!socket) {
      return;
    }
    socket.join(sessionId);
    socket.join(`${this.REDIS_KEY_PREFIX}-${sessionId}-${memberId}`);

    if (await this.sessionService.isSessionTerminated(sessionId)) {
      console.log(
        `disconnected session for ended session ${sessionId} by ${memberId}`,
      );
      socket.emit(EVENT_TYPE.ENDED);
      socket.disconnect();
      return;
    }

    const clientData = socket.data as { sessionId?: string; memberId?: number };
    clientData.sessionId = sessionId;
    clientData.memberId = memberId;

    if (joinStatus === JoinStatus.DUPLICATE) {
      return;
    }
    // 방 인원 업데이트 이벤트 발행
    this.updateSessionVolunteer(sessionId, result.volunteer);
    socket.emit(EVENT_TYPE.JOIN, { name: result.name, sessionId });

    // 현재 사용자가 마지막 참여자가 아닐때 종료
    const maxMemberCount =
      await this.blindDateService.getMaxSessionMemberCount();

    // 세션이 대기 상태면서 마지막 참여자인 경우 세션 시작
    if (result.volunteer == maxMemberCount) {
      this.startSession(sessionId);
    }
  }

  private async handleLeave(memberId: number) {
    await this.sessionService.leave(memberId);
  }

  private async handleChoice(
    sessionId: string,
    choicerId: number,
    targetId: number,
  ) {
    const createdRoomId = await this.blindDateService.choice({
      sessionId,
      choicerId,
      targetId,
    });

    if (!createdRoomId) {
      return;
    }

    this.server
      .to(`${this.REDIS_KEY_PREFIX}-${sessionId}-${choicerId}`)
      .emit(EVENT_TYPE.CREATE_CHATROOM, createdRoomId);
    this.server
      .to(`${this.REDIS_KEY_PREFIX}-${sessionId}-${targetId}`)
      .emit(EVENT_TYPE.CREATE_CHATROOM, createdRoomId);
  }

  private updateSessionVolunteer(sessionId: string, volunteer: number): void {
    this.server.to(sessionId).emit(EVENT_TYPE.JOINED, {
      sessionId,
      volunteer,
    });
  }

  private async startSession(sessionId: string) {
    this.emitStartEvent(sessionId); // 과팅 시작 이벤트 발행
    await this.sessionService.start(sessionId);
    this.server.to(sessionId).emit(EVENT_TYPE.FREEZE);

    // 시작 전 안내 멘트 전송
    const messages = this.blindDateMessage.getStartMessage();
    for (const message of messages) {
      this.server
        .to(sessionId)
        .emit(
          EVENT_TYPE.SYSTEM,
          new Broadcast(message, 0, '동냥이', new Date()),
        );

      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    }

    // 시간별로 이벤트 메시지 전송
    await this.sendEventMessage(sessionId);

    const participants = await this.sessionService.getAllMembers(sessionId);
    this.server.to(sessionId).emit('participants', participants);

    // 10초 선택시간 + 2초간 늦은 요청 처리를 위해 대기
    await new Promise<void>((resolve) => setTimeout(resolve, 12000));

    const notMatchedMember = await this.sessionService.getNotMatched(sessionId);

    if (notMatchedMember.length > 0) {
      const notMatchedMemberSocketRooms = notMatchedMember.map(
        (memberId) => `${this.REDIS_KEY_PREFIX}-${sessionId}-${memberId}`,
      );

      this.server.to(notMatchedMemberSocketRooms).emit('failed');
    }

    await this.sessionService.terminate(sessionId);
  }

  public emitStartEvent(sessionId: string) {
    this.server.to(sessionId).emit(EVENT_TYPE.START, {
      sessionId,
    });
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
}
