import { ArgumentsHost, Catch, WsExceptionFilter } from '@nestjs/common';
import { Socket } from 'socket.io';

@Catch()
export class CustomWsExceptionFilter implements WsExceptionFilter {
  catch(exception: Error, host: ArgumentsHost) {
    const client: Socket = host.switchToWs().getClient();

    client.emit('exception', {
      error: exception.constructor.name,
      message: exception.message,
      time: new Date().toISOString(),
    });
  }
}
