import nodeCron from 'node-cron';
import { BlindDateAvailableRequest } from '@/blinddate/dto/blinddate.available.dto';
import { SessionRepository } from '@/session/repository/session.repository';
import { BLIND_DATE_STATUS } from '@/blinddate/constant/blinddate.status';
import { Injectable } from '@nestjs/common';
import { SessionIdNotFoundException } from '@/blinddate/exception/SessionIdNotFoundException';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { SessionService } from '@/session/service/session.service';

@Injectable()
export class BlindDateService {
  private readonly MATCHING_ROOM_ID = 'MATCHING';

  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionRepository: SessionRepository,
    private readonly httpService: HttpService,
  ) {}

  public async availableBlindDate(request: BlindDateAvailableRequest) {
    await this.sessionRepository.startBlindDate();
    await this.sessionRepository.setMaxSessionMemberCount(
      request.getMaxSessionMemberCount(),
    );
    await this.sessionRepository.setPointerExpire(
      request.getExpiredDate().getTime(),
    );

    const expiredMinute = request.getExpiredDate().getMinutes();
    const expiredHour = request.getExpiredDate().getHours();
    const expiredDay = request.getExpiredDate().getDate();
    const expiredMonth = request.getExpiredDate().getMonth();
    const expression = `0 ${expiredMinute} ${expiredHour} ${expiredDay} ${expiredMonth + 1} * *`;

    nodeCron.schedule(expression, async () => {
      await this.sessionRepository.closeBlindDate();
    });
  }

  public async isAvailable(): Promise<boolean> {
    const status = await this.sessionRepository.getBlindDateStatus();

    if (!status || status === BLIND_DATE_STATUS.CLOSE) {
      return false;
    }

    return status === BLIND_DATE_STATUS.OPEN;
  }

  /**
   * 세션 배정
   * @param sessionId
   */
  public async assignSession(sessionId: string | string[] | undefined) {
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
    const memberCount = await this.getMaxSessionMemberCount();
    if (volunteer >= memberCount) {
      const newPointer = await this.sessionRepository.create();
      await this.sessionRepository.setPointer(newPointer);
      return newPointer;
    }

    return pointer;
  }

  public async requestToCreateChatRoom(
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

  public async choice({
    sessionId,
    choicerId,
    targetId,
  }: {
    sessionId: string;
    choicerId: number;
    targetId: number;
  }) {
    const isMatched = await this.sessionService.choice(
      sessionId,
      choicerId,
      targetId,
    );
    if (!isMatched) {
      return;
    }

    // 매칭 성공 시
    console.log(`matching success! ${choicerId} + ${targetId}`);
    const response = await this.requestToCreateChatRoom(choicerId, targetId);

    const createdRoomId: string = (response.data as { roomId: string }).roomId;
    if (!createdRoomId) {
      throw new Error('방이 생성되지 않았습니다.');
    }

    return createdRoomId;
  }

  public async getMaxSessionMemberCount() {
    const memberCount = await this.sessionRepository.getMaxSessionMemberCount();
    if (!memberCount) {
      return 0;
    }

    return Number(memberCount);
  }
}
