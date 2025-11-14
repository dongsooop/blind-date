import nodeCron from 'node-cron';
import { BlindDateAvailableRequest } from '@/blinddate/dto/blinddate.available.dto';
import { SessionRepository } from '@/session/repository/session.repository';
import { BLIND_DATE_STATUS } from '@/blinddate/constant/blinddate.status';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { SessionService } from '@/session/service/session.service';
import { IBlindDateService } from '@/blinddate/service/blinddate.service.interface';
import { BlindDateRepository } from '@/blinddate/repository/blinddate.repository';

@Injectable()
export class BlindDateService implements IBlindDateService {
  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionRepository: SessionRepository,
    private readonly blindDateRepository: BlindDateRepository,
    private readonly httpService: HttpService,
  ) {}

  public async availableBlindDate(request: BlindDateAvailableRequest) {
    await this.blindDateRepository.startBlindDate();
    await this.blindDateRepository.setMaxSessionMemberCount(
      request.getMaxSessionMemberCount(),
    );
    await this.blindDateRepository.setPointerExpire(
      request.getExpiredDate().getTime(),
    );

    const expiredMinute = request.getExpiredDate().getMinutes();
    const expiredHour = request.getExpiredDate().getHours();
    const expiredDay = request.getExpiredDate().getDate();
    const expiredMonth = request.getExpiredDate().getMonth();
    const expression = `0 ${expiredMinute} ${expiredHour} ${expiredDay} ${expiredMonth + 1} * *`;

    nodeCron.schedule(expression, async () => {
      await this.blindDateRepository.closeBlindDate();
    });
  }

  public async isAvailable(): Promise<boolean> {
    const status = await this.blindDateRepository.getBlindDateStatus();

    if (!status || status === BLIND_DATE_STATUS.CLOSE) {
      return false;
    }

    return status === BLIND_DATE_STATUS.OPEN;
  }

  /**
   * 세션 배정
   *
   * @param memberId 회원 ID
   */
  public async assignSession(memberId: number) {
    const sessionId =
      await this.sessionRepository.getSessionIdByMemberId(memberId);

    // 재연결일 때
    if (sessionId !== null) {
      return sessionId;
    }

    const pointer = await this.blindDateRepository.getPointer();

    // pointer가 가리키는 세션이 없을 때
    if (pointer === null) {
      return await this.initPointer();
    }

    // pointer가 가리키는 세션의 인원수가 찼을 때
    const session = await this.sessionRepository.getSession(pointer);
    const volunteer: number = session?.getParticipants().length || 0;
    const memberCount = await this.getMaxSessionMemberCount();
    if (volunteer >= memberCount) {
      return await this.initPointer();
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
      boardTitle: `${new Date().toISOString().slice(0, 10)}`,
      boardType: 'BLINDDATE',
      boardId: new Date().getTime() + 9 * 60 * 60 * 1000,
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
  }): Promise<string | null> {
    const isMatched = await this.sessionService.choice(
      sessionId,
      choicerId,
      targetId,
    );
    if (!isMatched) {
      return null;
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
    const memberCount =
      await this.blindDateRepository.getMaxSessionMemberCount();
    if (!memberCount) {
      return 0;
    }

    return Number(memberCount);
  }

  private async initPointer() {
    const newPointer = await this.sessionRepository.create();
    await this.blindDateRepository.setPointer(newPointer);
    return newPointer;
  }
}
