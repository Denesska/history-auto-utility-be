import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDto } from './dto/notification.dto';

function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

const WEB_ORIGINS = [
  'https://app.denhau.ro',
  'https://dev.denhau.ro',
  'http://localhost:4200',
];

const MOBILE_ORIGINS = ['https://localhost', 'capacitor://localhost'];

function userRoom(userId: number): string {
  return `user:${userId}`;
}

@WebSocketGateway({
  path: '/api/socket.io',
  cors: {
    origin: [...WEB_ORIGINS, ...MOBILE_ORIGINS],
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.['token'];
    if (authToken) return authToken;

    const cookieHeader = client.handshake.headers.cookie;
    if (!cookieHeader) return null;

    return readCookie(cookieHeader, 'access_token');
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });

      const user = await this.prisma.user.findUnique({
        where: { google_id: payload.sub },
        select: { id: true },
      });

      if (!user) {
        client.disconnect();
        return;
      }

      await client.join(userRoom(user.id));
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(): void {
    // Socket.IO cleans up room membership automatically on disconnect.
  }

  emitToUser(userId: number, notification: NotificationDto): void {
    this.server.to(userRoom(userId)).emit('notification', notification);
  }

  isUserConnected(userId: number): boolean {
    const room = this.server.sockets.adapter.rooms.get(userRoom(userId));
    return !!room && room.size > 0;
  }
}
