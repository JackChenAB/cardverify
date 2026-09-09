import { Body, Controller, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { Request } from 'express';
import { CardService } from '../card/card.service';
import { SignatureGuard } from '../crypto/signature.guard';
import { ResponseSignInterceptor } from '../crypto/response-sign.interceptor';
import { ActivateDto, VerifyDto } from './client.dto';

/**
 * Client-facing API used by the native application. Every request must carry a
 * valid HMAC signature (SignatureGuard) and every response is Ed25519-signed
 * (ResponseSignInterceptor) so the client can trust a positive answer.
 */
@Controller('api/v1')
@UseGuards(SignatureGuard)
@UseInterceptors(ResponseSignInterceptor)
export class ClientController {
  constructor(private readonly card: CardService) {}

  @Post('activate')
  async activate(@Body() dto: ActivateDto, @Req() req: Request) {
    const out = await this.card.activate(dto.code, dto.hwid, req.ip);
    return this.envelope('activate', req, out);
  }

  @Post('verify')
  async verify(@Body() dto: VerifyDto, @Req() req: Request) {
    const out = await this.card.verify(dto.code, dto.hwid, req.ip, dto.session, dto.takeover);
    return this.envelope('verify', req, out);
  }

  // Bind the response to the request nonce + a server timestamp before signing,
  // so a captured response cannot be replayed against a different request.
  private envelope(action: string, req: Request, out: object) {
    return {
      action,
      ...out,
      nonce: String(req.headers['x-nonce'] ?? ''),
      serverTime: new Date().toISOString(),
    };
  }
}
