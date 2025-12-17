import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/exception-filter/base.exception';

export class MemberNameNotFoundException extends BaseException {
  constructor(details?: Record<string, any>) {
    super(
      '회원 이름을 찾을 수 없습니다.',
      HttpStatus.INTERNAL_SERVER_ERROR,
      details,
    );
  }
}
