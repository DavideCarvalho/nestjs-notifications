import { Injectable } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server } from 'socket.io';

/**
 * A socket.io gateway that fans notifications out to per-notifiable rooms. Each
 * notifiable joins a room keyed by its `routeNotificationFor('broadcast')` value.
 */
@Injectable()
@WebSocketGateway()
export class NotificationsGateway {
  @WebSocketServer()
  server!: Server;

  /** Emit an event with a payload to every client in the given room. */
  emitToRoom(room: string, event: string, payload: unknown): void {
    this.server.to(room).emit(event, payload);
  }
}
