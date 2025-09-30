import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/exception-filter/base.exception';

export class MemberIdNotAvailableException extends BaseException {
  constructor(details?: Record<string, any>) {
    super(
      '소켓에 회원 ID가 존재하지 않습니다.',
      HttpStatus.BAD_REQUEST,
      details,
    );
  }
}
