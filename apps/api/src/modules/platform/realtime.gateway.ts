// ─── Realtime Gateway ──────────────────────────────────────────
// Tenant-scoped WebSocket gateway that validates a JWT on connect,
// joins each client to `tenant:{tenantId}` and `user:{userId}` rooms,
// and relays broadcastable domain events from the BullMQ EventBus to
// the owning tenant's room. Only event types listed in
// `BROADCASTABLE_EVENT_TYPES` are relayed -- sensitive events
// (payments, KYC, auth) are filtered out.

import { Logger, OnModuleInit, Optional } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  BROADCASTABLE_EVENT_TYPES,
  isBroadcastableEventType,
  type DomainEvent,
  type DomainEventType,
} from '@caratflow/shared-types';
import { EventBusService } from '../../event-bus/event-bus.service';
import { AccessTokenDenylistService } from '../../auth/access-token-denylist.service';
import { resolveStaffClaims } from '../../auth/access-token';

@WebSocketGateway({ namespace: '/realtime', cors: { origin: true, credentials: true } })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly eventBus: EventBusService,
    @Optional() private readonly denylist?: AccessTokenDenylistService,
  ) {}

  onModuleInit(): void {
    // Subscribe to every broadcastable event type. Each handler emits to
    // the owning tenant's room. If the server isn't attached yet (e.g. in
    // unit tests) we simply no-op.
    for (const type of BROADCASTABLE_EVENT_TYPES) {
      this.eventBus.subscribe(type as DomainEventType, async (event) => {
        this.broadcastEvent(event);
      });
    }
  }

  /** Emit a domain event to the tenant room, filtering out non-broadcastable types. */
  broadcastEvent(event: DomainEvent): void {
    if (!isBroadcastableEventType(event.type)) {
      return;
    }
    if (!this.server) {
      return;
    }
    try {
      this.server.to(`tenant:${event.tenantId}`).emit('domain-event', {
        type: event.type,
        tenantId: event.tenantId,
        userId: event.userId,
        timestamp: event.timestamp,
        payload: event.payload,
      });
    } catch (err) {
      this.logger.warn(`Failed to broadcast ${event.type}: ${(err as Error).message}`);
    }
  }

  handleConnection(client: Socket): void {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      this.extractBearer(client.handshake.headers?.authorization);

    if (!token) {
      this.logger.warn(`Rejecting socket ${client.id}: no token`);
      client.emit('error', { message: 'Unauthorized: missing token' });
      client.disconnect(true);
      return;
    }

    // Staff tokens only: B2C customer tokens, invalid/expired and revoked tokens are rejected.
    const claims = resolveStaffClaims(token, this.denylist);
    if (!claims) {
      this.logger.warn(`Rejecting socket ${client.id}: invalid or non-staff token`);
      client.emit('error', { message: 'Unauthorized: invalid token' });
      client.disconnect(true);
      return;
    }

    (client.data as Record<string, unknown>).tenantId = claims.tenantId;
    (client.data as Record<string, unknown>).userId = claims.sub;

    void client.join(`tenant:${claims.tenantId}`);
    void client.join(`user:${claims.sub}`);

    this.logger.log(
      `Socket ${client.id} connected: tenant=${claims.tenantId} user=${claims.sub}`,
    );
    client.emit('ready', { tenantId: claims.tenantId, userId: claims.sub });
  }

  handleDisconnect(client: Socket): void {
    // socket.io leaves rooms automatically on disconnect.
    this.logger.log(`Socket ${client.id} disconnected`);
  }

  private extractBearer(header: string | string[] | undefined): string | undefined {
    if (!header) return undefined;
    const value = Array.isArray(header) ? header[0] : header;
    if (value?.startsWith('Bearer ')) return value.slice(7);
    return undefined;
  }
}
