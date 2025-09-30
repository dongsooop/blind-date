import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // HttpException 처리
    if (exception instanceof HttpException) {
      this.logException(exception, { path: request.url });
      return response.status(exception.getStatus()).json({
        time: new Date().toISOString(),
        ...this.getExceptionResponse(exception),
        errorName: exception.name,
      });
    }

    // 예상치 못한 예외 처리
    this.logException(exception, { path: request.url });
    return this.getUnexpectedExceptionResponse(exception, response);
  }

  private getExceptionResponse(exception: HttpException): Record<string, any> {
    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'object') {
      return exceptionResponse;
    }

    return { message: exceptionResponse };
  }

  private getUnexpectedExceptionResponse(exception: Error, response: Response) {
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: exception.constructor.name,
      message: exception.message,
      time: new Date().toISOString(),
    });
  }

  private logException(exception: Error, requestInfo: any) {
    this.logger.error({
      type: exception.constructor.name,
      message: exception.message,
      ...requestInfo,
    });
  }
}
