import { HttpException, HttpStatus } from '@nestjs/common';

export class MemberIdNotAvailableException extends HttpException {
  constructor(details?: Record<string, any>) {
    const response = {
      statusCode: HttpStatus.BAD_REQUEST,
      message: '소켓에 회원 ID가 존재하지 않습니다.',
      error: HttpStatus[HttpStatus.BAD_REQUEST],
      time: new Date().toISOString(),
      details,
    };
    super(response, HttpStatus.BAD_REQUEST);
  }
}
