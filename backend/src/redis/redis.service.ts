import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Thin Redis wrapper used for replay protection (one-time nonces) and basic
 * rate limiting. Falls back to an in-memory store when REDIS_URL is unset or
 * the server is unreachable, so the app still runs in local/dev setups.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly nonceMem = new Map<string, number>(); // nonce -> expiry epoch ms
  private readonly countMem = new Map<string, { count: number; expiry: number }>();

  onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL not set — using in-memory nonce/rate store (single instance only).');
      return;
    }
    this.client = new Redis(url, { maxRetriesPerRequest: 2 });
    this.client.on('error', (e) => this.logger.error(`Redis error: ${e.message}`));
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => undefined);
  }

  /** Atomically claims a nonce. Returns true if it was unused (i.e. accept). */
  async consumeNonce(nonce: string, ttlSeconds: number): Promise<boolean> {
    const key = `nonce:${nonce}`;
    if (this.client) {
      const res = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    }
    const now = Date.now();
    for (const [k, exp] of this.nonceMem) if (exp <= now) this.nonceMem.delete(k);
    if (this.nonceMem.has(key)) return false;
    this.nonceMem.set(key, now + ttlSeconds * 1000);
    return true;
  }

  /** Increments a counter under `key`, returns the new count. Sets TTL on first hit. */
  async incrWindow(key: string, ttlSeconds: number): Promise<number> {
    if (this.client) {
      const n = await this.client.incr(key);
      if (n === 1) await this.client.expire(key, ttlSeconds);
      return n;
    }
    const now = Date.now();
    const entry = this.countMem.get(key);
    if (!entry || entry.expiry <= now) {
      this.countMem.set(key, { count: 1, expiry: now + ttlSeconds * 1000 });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }
}
