import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';

@Injectable()
export class BlindDateMessage {
  private readonly eventMessages = [
    '전 연인의 절친과 결혼 vs 절친의 전 연인과 결혼',
    '돈은 많은데 내가 가장 혐오하는 외모와 스타일 vs 찢어질 듯 가난한데 내 평생의 이상형',
    '국내여행 어디든 20번 무료로 가기 vs 제일 가고 싶은 해외 여행지 딱 1번 무료로 가기',
    '5분 과거로 돌아갈 수 있음 vs 5분 미래를 볼 수 있음',
    '연하 같은 연상 vs 연상 같은 연하',
    '나랑 찍은 셀카 절대 안 올리는 애인 vs 내 모든 사진을 올리는 애인',
    '친구 500명인 애인 vs 친구 없는 애인',
    '사소한 맞춤법도 틀리는 애인 vs 사소한 맞춤법도 지적하는 애인',
  ];

  getStartMessage(): string[] {
    return [
      '안녕하세요 여러분\n저는 오늘 \n진행을 맡은 동냥이입니다 :) ',
      '과팅에 대해서 간단히\n소개해 드리고자 찾아왔습니다!',
      '과팅은 15분간 진행되며, 종료 후엔\n해당 채팅방은 다시 참여하실 수 없습니다.',
      '저는 총 3개의 질문을 말씀드립니다.\n여러분은 자유롭게 질문에 대한 답변을\n나누시면 됩니다.',
      '마지막 단계에선, 나눴던 대화를\n토대로 마음에 드셨던 한 분을\n선택하실 수 있습니다!',
      '사랑의 작대기가 이어진 분들에겐\n1:1 채팅방을 만들어 드리니\n애프터까지 파이팅 해보세요!',
      '첫 번째 대화 주제입니다!',
    ];
  }

  getEventMessage(amount: number): string[] {
    const result: string[] = [...this.eventMessages];
    for (let i = 0; i < amount; ++i) {
      const randomNumber = randomInt(this.eventMessages.length);

      [result[i], result[randomNumber]] = [result[randomNumber], result[i]];
    }

    return result.slice(0, 3);
  }
}
