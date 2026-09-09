import { createHmac, randomBytes, verify as edVerify, createPublicKey } from 'crypto';

/** Mirrors the native client: builds the signed headers for a request. */
export function signRequest(
  appSecret: string,
  method: string,
  path: string,
  body: unknown,
) {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Date.now());
  const nonce = randomBytes(16).toString('hex');
  const message = `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${rawBody}`;
  const signature = createHmac('sha256', appSecret).update(message, 'utf8').digest('hex');
  return {
    headers: {
      'content-type': 'application/json',
      'x-timestamp': timestamp,
      'x-nonce': nonce,
      'x-signature': signature,
    },
    rawBody,
    nonce,
  };
}

/** Verifies the Ed25519 response signature the way the native client would. */
export function verifyResponse(publicKeyPem: string, payload: string, sig: string): boolean {
  return edVerify(
    null,
    Buffer.from(payload, 'utf8'),
    createPublicKey(publicKeyPem),
    Buffer.from(sig, 'base64'),
  );
}
