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
import { MemberIdNotAvailableException } from '@/blinddate/exception/MemberIdNotAvailableException';
import { SESSION_STATE } from '@/session/const/session.constant';
import { queueConfig } from '@/queue/queue.config';
import { SessionKeyFactory } from '@/session/repository/session-key.factory';

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
  private signal: AbortSignal;

  private readonly EVENT_MESSAGE_AMOUNT = 3;
  private readonly REDIS_KEY_PREFIX = queueConfig().getRedisKeyPrefix();
  private readonly CHOICE_TIME = queueConfig().getChoiceTime();
  private readonly START_MESSAGE_DELAY = queueConfig().getStartMessageDelay();
  private readonly CHATTING_TIME = queueConfig().getChattingTime();
  private readonly MESSAGE_WAITING_TIME = queueConfig().getMessageWaitingTime();
  private readonly SESSION_MANAGER_NAME = queueConfig().getSessionManagerName();
  private readonly SESSION_QUEUE_KEY = queueConfig().getSessionQueueKey();
  private readonly CHOICE_QUEUE_KEY = queueConfig().getChoiceQueueKey();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClientType,
    private readonly sessionService: SessionService,
    private readonly blindDateService: BlindDateService,
    private readonly blindDateMessage: BlindDateMessage,
  ) {}

  public initServer(server: Server) {
    this.server = server;

    const { signal } = new AbortController();
    this.signal = signal;

    this.startSessionQueue().catch((err: Error) => {
      console.error(`Failed to start Session Queue Consumer`, err);
    });

    this.startChoiceQueue().catch((err: Error) => {
      console.error(`Failed to start Choice Queue Consumer`, err);
    });
  }

  private async startChoiceQueue() {
    console.log('[Choice Queue] started');

    const subscriber = this.redisClient.duplicate();
    await subscriber.connect();

    while (!this.signal.aborted) {
      try {
        const queue = await subscriber.brPop(this.CHOICE_QUEUE_KEY, 0);
        if (!queue?.element) {
          continue;
        }
        await this.process(JSON.parse(queue.element) as JobType);
      } catch (e) {
        console.error(e);
      }
    }
  }

  private async startSessionQueue() {
    console.log('[Session Queue] started');

    const subscriber = this.redisClient.duplicate();
    await subscriber.connect();

    while (!this.signal.aborted) {
      try {
        const queue = await subscriber.brPop(this.SESSION_QUEUE_KEY, 0);
        if (!queue?.element) {
          continue;
        }
        await this.process(JSON.parse(queue.element) as JobType);
      } catch (e) {
        console.error(e);
      }
    }
  }

  private async process(job: JobType) {
    console.log(job);
    switch (job.type) {
      case BlindDateQueue.ENTER:
        return this.handleEnter(job.socketId);

      case BlindDateQueue.LEAVE:
        return this.handleLeave(job.memberId, job.sessionId, job.socketId);

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

  private async handleEnter(socketId: string) {
    const sockets = await this.server.fetchSockets();
    const socket = sockets.find((s) => s.id === socketId);
    if (!socket) {
      return;
    }

    const isAvailable = await this.blindDateService.isAvailable();
    if (!isAvailable) {
      console.log(`Blinddate service not available. Request By: ${socketId}`);
      socket.disconnect();
      return;
    }

    // 회원 ID
    const memberId = Number(socket.handshake.query.memberId);
    if (isNaN(memberId)) {
      throw new MemberIdNotAvailableException();
    }

    const { sessionId, joinStatus } =
      await this.blindDateService.assignSession(memberId);

    const result = await this.sessionService.addMember(
      sessionId,
      memberId,
      socketId,
    );

    console.log(`member(${memberId}) joined to session${sessionId}`);

    // 세션 구독
    socket.join(sessionId);
    socket.join(SessionKeyFactory.getPersonalKeyName(sessionId, memberId));

    const sessionState = await this.sessionService.getSessionState(sessionId);

    if (sessionState === SESSION_STATE.ENDED) {
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

    socket.emit(EVENT_TYPE.JOIN, {
      name: result.name,
      state: sessionState,
    });

    if (joinStatus === JoinStatus.DUPLICATE) {
      this.updateSessionVolunteer(socket.id, result.volunteer);
      return;
    }

    // 방 인원 업데이트 이벤트 발행
    this.updateSessionVolunteer(sessionId, result.volunteer);

    // 현재 사용자가 마지막 참여자가 아닐때 종료
    const maxMemberCount =
      await this.blindDateService.getMaxSessionMemberCount();

    // 세션이 대기 상태면서 마지막 참여자인 경우 세션 시작
    if (result.volunteer == maxMemberCount) {
      console.log(`Session ${sessionId} start by member: ${memberId}`);
      this.startSession(sessionId).catch((err) => {
        console.error(`An error occurred during the session`, err);
      });
    }
  }

  private async handleLeave(
    memberId: number,
    sessionId: string | null,
    socketId: string,
  ) {
    if (!sessionId) {
      console.log(`[QueueConsumer] Unknown Session Id is null`);
      return;
    }

    const volunteer = await this.sessionService.leave(
      sessionId,
      memberId,
      socketId,
    );
    if (!volunteer) {
      console.error('volunteer does not exist');
      return;
    }

    this.updateSessionVolunteer(sessionId, volunteer);
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
      .to(SessionKeyFactory.getPersonalKeyName(sessionId, choicerId))
      .emit(EVENT_TYPE.CREATE_CHATROOM, createdRoomId);
    this.server
      .to(SessionKeyFactory.getPersonalKeyName(sessionId, targetId))
      .emit(EVENT_TYPE.CREATE_CHATROOM, createdRoomId);
  }

  private updateSessionVolunteer(sessionId: string, volunteer: number): void {
    this.server.to(sessionId).emit(EVENT_TYPE.JOINED, volunteer);
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
          new Broadcast(message, 0, this.SESSION_MANAGER_NAME, new Date()),
        );

      await new Promise<void>((resolve) =>
        setTimeout(resolve, this.START_MESSAGE_DELAY),
      );
    }

    // 시간별로 이벤트 메시지 전송
    await this.sendEventMessage(sessionId);

    const participants = await this.sessionService.getAllMembers(sessionId);
    this.server.to(sessionId).emit(EVENT_TYPE.PARTICIPANTS, participants);

    // 사랑의 막대기 선택시간 대기
    await new Promise<void>((resolve) => setTimeout(resolve, this.CHOICE_TIME));

    const notMatchedMember = await this.sessionService.getNotMatched(sessionId);

    if (notMatchedMember.length > 0) {
      const notMatchedMemberSocketRooms = notMatchedMember.map((memberId) =>
        SessionKeyFactory.getPersonalKeyName(sessionId, memberId),
      );

      this.server.to(notMatchedMemberSocketRooms).emit(EVENT_TYPE.FAILED);
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
          new Broadcast(message, 0, this.SESSION_MANAGER_NAME, new Date()),
        );

      // 메시지 전달 후 채팅 활성화
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          this.server.to(sessionId).emit(EVENT_TYPE.THAW);
          resolve();
        }, this.MESSAGE_WAITING_TIME);
      });

      // 사용자 채팅 시간 주기
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, this.CHATTING_TIME);
      });
    }
  }
}
