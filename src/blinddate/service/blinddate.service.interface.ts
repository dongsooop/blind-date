import { BlindDateAvailableRequest } from '@/blinddate/dto/blinddate.available.dto';
import { AxiosResponse } from 'axios';
import { JoinType } from '@/blinddate/constant/join.type';

export interface IBlindDateService {
  /**
   * 과팅 활성화
   * @param request
   */
  availableBlindDate(request: BlindDateAvailableRequest): Promise<void>;

  /**
   * 과팅 활성화 여부 확인
   */
  isAvailable(): Promise<boolean>;

  /**
   * 회원에게 적합한 세션 반환(참여중인 회원이면 참여중인 세션 id, 새로운 참여자면 새 세션 id)
   * @param memberId
   */
  assignSession(
    memberId: number,
  ): Promise<{ sessionId: string; joinStatus: JoinType }>;

  /**
   * 메인 spring boot 서버로 채팅방 생성 요청
   * @param sourceUserId
   * @param targetUserId
   */
  requestToCreateChatRoom(
    sourceUserId: number,
    targetUserId: number,
  ): Promise<AxiosResponse>;

  /**
   *
   * @param sessionId
   * @param choicerId
   * @param targetId
   */
  choice({
    sessionId,
    choicerId,
    targetId,
  }: {
    sessionId: string;
    choicerId: number;
    targetId: number;
  }): Promise<string | null>;
}
