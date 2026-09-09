import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  createHmac,
  timingSafeEqual,
  sign as edSign,
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  KeyObject,
} from 'crypto';

/**
 * Handles the two cryptographic layers protecting the client API:
 *  1. HMAC-SHA256 request signatures (shared APP_SECRET, embedded in client).
 *  2. Ed25519 response signatures (server private key; client holds public key)
 *     so a forged/MITM server cannot fabricate a "valid" answer.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly logger = new Logger(CryptoService.name);
  private appSecret = '';
  private edPrivate!: KeyObject;
  private edPublicPem = '';

  onModuleInit() {
    this.appSecret = process.env.APP_SECRET ?? '';
    if (!this.appSecret) {
      this.logger.warn('APP_SECRET not set — request signature verification will reject all clients.');
    }

    const privB64 = process.env.ED25519_PRIVATE_KEY;
    const pubB64 = process.env.ED25519_PUBLIC_KEY;
    if (privB64 && pubB64) {
      this.edPrivate = createPrivateKey(Buffer.from(privB64, 'base64').toString('utf8'));
      this.edPublicPem = Buffer.from(pubB64, 'base64').toString('utf8');
    } else {
      this.logger.warn(
        'ED25519 keys not set — generating an EPHEMERAL key pair. Clients will fail to verify after restart. Set ED25519_PRIVATE_KEY / ED25519_PUBLIC_KEY for production.',
      );
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      this.edPrivate = privateKey;
      this.edPublicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    }
    // Normalize: ensure public key is parseable.
    createPublicKey(this.edPublicPem);
  }

  /** Canonical string the client must HMAC: METHOD\nPATH\nTIMESTAMP\nNONCE\nRAWBODY */
  buildSigningString(method: string, path: string, timestamp: string, nonce: string, rawBody: string) {
    return `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${rawBody}`;
  }

  hmacHex(message: string): string {
    return createHmac('sha256', this.appSecret).update(message, 'utf8').digest('hex');
  }

  verifyHmac(message: string, providedHex: string): boolean {
    if (!this.appSecret || !providedHex) return false;
    const expected = Buffer.from(this.hmacHex(message), 'hex');
    let provided: Buffer;
    try {
      provided = Buffer.from(providedHex, 'hex');
    } catch {
      return false;
    }
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(expected, provided);
  }

  /**
   * Wraps a response payload with an Ed25519 signature. The signed bytes are the
   * literal `payload` JSON string so the client verifies over identical bytes.
   */
  signPayload(data: unknown): { payload: string; sig: string } {
    const payload = JSON.stringify(data);
    const sig = edSign(null, Buffer.from(payload, 'utf8'), this.edPrivate).toString('base64');
    return { payload, sig };
  }

  /** PEM (SPKI) public key, exposed so the admin can copy it into the client build. */
  getPublicKeyPem(): string {
    return this.edPublicPem;
  }
}
