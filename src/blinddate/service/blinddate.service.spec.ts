import { BlindDateService } from './blinddate.service';
import { SessionRepository } from '../../session/repository/session.repository';
import { SessionService } from '../../session/service/session.service';
import { BlindDateRepository } from '../repository/blinddate.repository';
import { HttpService } from '@nestjs/axios';
import Session from '../../session/entity/session.entity';
import {
  SESSION_STATE,
  SESSION_STATE_TYPE,
} from '../../session/const/session.constant';
import { JoinStatus } from '../constant/join.type';

jest.mock('../../queue/queue.config', () => ({
  queueConfig: () => ({ getRedisKeyPrefix: () => 'test' }),
}));

describe('과팅 참여 세션 배정', () => {
  let service: BlindDateService;
  let memberSession: string | null;
  let oldState: string | null;
  let pointer: string | null;
  let pointerState: SESSION_STATE_TYPE;
  let participants: string[];
  const sessions = {
    getSessionIdByMemberId: jest.fn(() => Promise.resolve(memberSession)),
    getSessionStatus: jest.fn(() => Promise.resolve(oldState)),
    getSession: jest.fn(() =>
      Promise.resolve(
        new Session({ state: pointerState, participants, nameCounter: 1 }),
      ),
    ),
    create: jest.fn(() => Promise.resolve('new-session')),
  };
  const blindDate = {
    getPointer: jest.fn(() => Promise.resolve(pointer)),
    setPointer: jest.fn((value: string) => {
      pointer = value;
      return Promise.resolve();
    }),
    getMaxSessionMemberCount: jest.fn(() => Promise.resolve('2')),
  };

  beforeEach(() => {
    memberSession = 'old-session';
    oldState = SESSION_STATE.ENDED;
    pointer = 'waiting-session';
    pointerState = SESSION_STATE.WAITING;
    participants = ['2'];
    service = new BlindDateService(
      {} as SessionService,
      sessions as unknown as SessionRepository,
      blindDate as unknown as BlindDateRepository,
      {} as HttpService,
    );
  });

  it('참여 완료 직후 같은 회원을 대기 세션에 새로 배정한다', async () => {
    expect(await service.assignSession(1)).toEqual({
      sessionId: 'waiting-session',
      joinStatus: JoinStatus.FIRST,
    });
  });

  it.each([SESSION_STATE.WAITING, SESSION_STATE.PROCESSING])(
    '%s 세션 참여자는 기존 세션에 재연결한다',
    async (state) => {
      oldState = state;
      expect(await service.assignSession(1)).toEqual({
        sessionId: 'old-session',
        joinStatus: JoinStatus.DUPLICATE,
      });
    },
  );

  it('이전 세션이 만료되었으면 새로 배정한다', async () => {
    oldState = null;
    expect(await service.assignSession(1)).toEqual({
      sessionId: 'waiting-session',
      joinStatus: JoinStatus.FIRST,
    });
  });

  it('참여 이력이 없는 회원도 대기 세션에 새로 배정한다', async () => {
    memberSession = null;
    expect(await service.assignSession(1)).toEqual({
      sessionId: 'waiting-session',
      joinStatus: JoinStatus.FIRST,
    });
  });

  it('대기 세션이 없으면 새 세션에 배정한다', async () => {
    pointer = null;
    expect(await service.assignSession(1)).toEqual({
      sessionId: 'new-session',
      joinStatus: JoinStatus.FIRST,
    });
    expect(pointer).toBe('new-session');
  });

  it('정원이 찬 대기 세션 대신 새 세션에 배정한다', async () => {
    participants = ['2', '3'];
    expect(await service.assignSession(1)).toEqual({
      sessionId: 'new-session',
      joinStatus: JoinStatus.FIRST,
    });
    expect(pointer).toBe('new-session');
  });

  it.each([SESSION_STATE.ENDED, SESSION_STATE.PROCESSING])(
    '포인터가 %s 세션이면 새 세션에 배정한다',
    async (state) => {
      pointerState = state;
      expect(await service.assignSession(1)).toEqual({
        sessionId: 'new-session',
        joinStatus: JoinStatus.FIRST,
      });
      expect(pointer).toBe('new-session');
    },
  );
});
