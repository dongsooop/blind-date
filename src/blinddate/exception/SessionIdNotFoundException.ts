import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/exception-filter/base.exception';

export class SessionIdNotFoundException extends BaseException {
  constructor(details?: Record<string, any>) {
    super(
      '서버에 존재하지 않는 세션 ID 입니다.',
      HttpStatus.BAD_REQUEST,
      details,
    );
  }
}
