import { Injectable } from '@nestjs/common';

@Injectable()
export class BlindDateMessage {
  getStartMessage(): string[] {
    return [
      '안녕하세요 여러분\n저는 오늘 \n진행을 맡은 동냥이입니다 :) ',
      '과팅에 대해서 간단히\n소개해 드리고자 찾아왔습니다!',
      '과팅은 15분간 진행되며, 종료 후엔\n해당 채팅방은 다시 참여하실 수 없습니다.',
      '저는 총 3개의 질문을 말씀드립니다.\n여러분은 자유롭게 질문에 대한 답변을\n나누시면 됩니다.',
      '마지막 단계에선, 나눴던 대화를\n토대로 마음에 드셨던 한 분을\n선택하실 수 있습니다!',
      '사랑의 작대기가 이어진 분들에겐\n1:1 채팅방을 만들어 드리니\n애프터까지 파이팅 해보세요!',
      '이제 과팅을 시작해 볼까요?',
    ];
  }

  getEventMessage(): string[] {
    return [];
  }
}
