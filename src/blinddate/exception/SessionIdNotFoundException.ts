import { HttpException, HttpStatus } from '@nestjs/common';

export class SessionIdNotFoundException extends HttpException {
  constructor(details?: Record<string, any>) {
    const response = {
      statusCode: HttpStatus.BAD_REQUEST,
      message: '서버에 존재하지 않는 세션 ID 입니다.',
      error: HttpStatus[HttpStatus.BAD_REQUEST],
      time: new Date().toISOString(),
      details,
    };
    super(response, HttpStatus.BAD_REQUEST);
  }
}
