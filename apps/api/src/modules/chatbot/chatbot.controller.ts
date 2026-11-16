// ─── Chatbot REST Controller ───────────────────────────────────
// Public-facing storefront chat API at /api/v1/store/chat/*
// Consumed by the ChatWidget component on the storefront.

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ApiResponse } from '@caratflow/shared-types';
import type { ChatSessionResponse, ChatMessageResponse } from '@caratflow/shared-types';
import { ChatbotService } from './chatbot.service';
import { extractContext, type HeaderBearingRequest } from '../../common/customer-identity';

function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

@Controller('api/v1/store/chat')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  /**
   * Start a new chat session. The sessionId is always generated server-side
   * to prevent client-controlled session takeover (D-040).
   *
   * Note: We deliberately ignore any client-supplied `sessionId` in the body.
   * If the client wants to resume, it must use the sessionId we returned from
   * a prior /start and authenticate (Bearer B2C token) as the same customer.
   */
  @Post('start')
  @HttpCode(HttpStatus.OK)
  async startChat(
    @Req() req: HeaderBearingRequest,
    @Body() _body: { sessionId?: string; customerId?: string },
  ): Promise<ApiResponse<ChatSessionResponse>> {
    const ctx = extractContext(req);
    const sessionId = `chat_${randomUUID()}`;

    const data = await this.chatbotService.startSession(
      ctx.tenantId,
      sessionId,
      ctx.customerId ?? undefined,
    );
    return success(data);
  }

  /**
   * Send a message to the chatbot and receive response(s).
   */
  @Post('message')
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @Req() req: HeaderBearingRequest,
    @Body() body: { sessionId: string; content: string; messageType?: string },
  ): Promise<ApiResponse<{ messages: ChatMessageResponse[] }>> {
    const ctx = extractContext(req);

    if (!body.sessionId) throw new BadRequestException('sessionId is required');
    if (!body.content || body.content.trim().length === 0) {
      throw new BadRequestException('Message content is required');
    }

    const data = await this.chatbotService.processMessage(
      ctx.tenantId,
      body.sessionId,
      body.content.trim(),
      body.messageType,
      ctx.customerId,
    );
    return success(data);
  }

  /**
   * Get chat session history.
   */
  @Get('session/:sessionId')
  async getSession(
    @Req() req: HeaderBearingRequest,
    @Param('sessionId') sessionId: string,
  ): Promise<ApiResponse<ChatSessionResponse>> {
    const ctx = extractContext(req);
    if (!ctx.customerId) throw new UnauthorizedException('Customer login required');
    const data = await this.chatbotService.getSession(ctx.tenantId, sessionId, ctx.customerId);
    return success(data);
  }

  /**
   * Escalate the chat session to a human agent.
   */
  @Post('escalate/:sessionId')
  @HttpCode(HttpStatus.OK)
  async escalateSession(
    @Req() req: HeaderBearingRequest,
    @Param('sessionId') sessionId: string,
  ): Promise<ApiResponse<null>> {
    const ctx = extractContext(req);
    await this.chatbotService.escalateToHuman(ctx.tenantId, sessionId, undefined, ctx.customerId);
    return success(null);
  }

  /**
   * Close a chat session.
   */
  @Post('close/:sessionId')
  @HttpCode(HttpStatus.OK)
  async closeSession(
    @Req() req: HeaderBearingRequest,
    @Param('sessionId') sessionId: string,
  ): Promise<ApiResponse<null>> {
    const ctx = extractContext(req);
    await this.chatbotService.closeSession(ctx.tenantId, sessionId, ctx.customerId);
    return success(null);
  }
}
