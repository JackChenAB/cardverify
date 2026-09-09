import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { RedisService } from '../redis/redis.service';

const MAX_SKEW_MS = 60_000; // accept timestamps within +/- 60s
const NONCE_TTL_S = 120; // remember nonces a bit longer than the skew window

/**
 * Verifies the HMAC signature, timestamp freshness and nonce uniqueness of
 * incoming client requests. Applied to the signed client API only.
 */
@Injectable()
export class SignatureGuard implements CanActivate {
  constructor(
    private readonly crypto: CryptoService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const timestamp = String(req.headers['x-timestamp'] ?? '');
    const nonce = String(req.headers['x-nonce'] ?? '');
    const signature = String(req.headers['x-signature'] ?? '');
    const rawBody: string = req.rawBody ?? '';

    if (!timestamp || !nonce || !signature) {
      throw new UnauthorizedException('missing signature headers');
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
      throw new UnauthorizedException('stale or invalid timestamp');
    }

    const message = this.crypto.buildSigningString(req.method, req.path, timestamp, nonce, rawBody);
    if (!this.crypto.verifyHmac(message, signature)) {
      throw new UnauthorizedException('bad signature');
    }

    // Replay protection: a nonce may be used once within its TTL.
    const fresh = await this.redis.consumeNonce(nonce, NONCE_TTL_S);
    if (!fresh) {
      throw new UnauthorizedException('replayed nonce');
    }

    return true;
  }
}
