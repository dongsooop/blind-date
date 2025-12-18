import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EVENT_TYPE } from '@/blinddate/constant/blinddate.event.type';
import { Broadcast } from '@/blinddate/constant/Broadcast';
import { BlindDateService } from '@/blinddate/service/blinddate.service';
import { CustomWsExceptionFilter } from '@/exception-filter/websocket.exception.filter';
import { UseFilters } from '@nestjs/common';
import { SessionService } from '@/session/service/session.service';
import { QueueProducer } from '@/queue/queue.producer';
import { QueueConsumer } from '@/queue/queue.consumer';

@UseFilters(CustomWsExceptionFilter)
@WebSocketGateway({
  namespace: 'blinddate',
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
})
export class BlindDateGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly blindDateService: BlindDateService,
    private readonly sessionService: SessionService,
    private readonly queueProducer: QueueProducer,
    private readonly queueConsumer: QueueConsumer,
  ) {}

  afterInit() {
    console.log('WebSocket Gateway Initialized');
    this.queueConsumer.initServer(this.server);
  }

  /**
   * 소켓 연결
   * @param client 사용자 소켓
   */
  async handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);

    await this.queueProducer.pushEnterQueue({ socketId: client.id });
  }

  async handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);

    const clientData = client.data as { sessionId?: string; memberId?: number };
    const memberId = clientData.memberId;
    const sessionId = clientData.sessionId;

    if (!memberId || !sessionId) {
      console.error(`Member data not found for ${client.id}`);
      return;
    }

    await this.queueProducer.pushLeaveQueue({
      memberId,
      sessionId,
      socketId: client.id,
    });
  }

  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { message: string; senderId: number },
  ) {
    console.log(
      `${new Date().toISOString()}: Received message from client: ${client.id}`,
    );

    const { sessionId } = client.data as { sessionId: string | null };
    if (!sessionId) {
      console.error(`Member data not found for ${client.id}`);
      return;
    }

    const name = await this.sessionService.getName(sessionId, data.senderId);

    this.server
      .to(sessionId)
      .emit(
        EVENT_TYPE.BROADCAST,
        new Broadcast(data.message, data.senderId, name, new Date()),
      );
  }

  @SubscribeMessage('choice')
  async handleVote(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      choicerId: number;
      targetId: number;
    },
  ) {
    console.log(
      `Received choice from client: ${data.choicerId}, and targetId: ${data.targetId}`,
    );

    const { sessionId, memberId } = client.data as {
      sessionId: string | null;
      memberId: number | null;
    };
    if (!sessionId || !memberId) {
      console.error(`Member data not found for ${client.id}`);
      return;
    }

    await this.queueProducer.pushChoiceQueue({
      sessionId,
      memberId,
      targetId: data.targetId,
      socketId: client.id,
    });
  }
}
