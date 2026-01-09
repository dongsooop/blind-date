import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/exception-filter/base.exception';

export class SessionStateNotFoundException extends BaseException {
  constructor(details?: Record<string, any>) {
    super(
      '세션 상태를 찾을 수 없습니다.',
      HttpStatus.INTERNAL_SERVER_ERROR,
      details,
    );
  }
}
