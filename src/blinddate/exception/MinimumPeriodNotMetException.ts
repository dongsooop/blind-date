import { BaseException } from '@/exception-filter/base.exception';
import { HttpStatus } from '@nestjs/common';

export class MinimumPeriodNotMetException extends BaseException {
  constructor(details?: Record<string, any>) {
    super('최소 기간을 충족하지 못했습니다.', HttpStatus.BAD_REQUEST, details);
  }
}
