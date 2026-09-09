// Runs before the e2e test module is imported, so env-dependent module
// initialization (JwtModule.register, etc.) sees these values.
import { randomBytes, generateKeyPairSync } from 'crypto';

process.env.NODE_ENV = 'test';
process.env.APP_SECRET = process.env.APP_SECRET ?? randomBytes(32).toString('hex');
process.env.JWT_SECRET = process.env.JWT_SECRET ?? randomBytes(32).toString('hex');
process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'e2e_admin';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'e2e_password_123';

if (!process.env.ED25519_PRIVATE_KEY || !process.env.ED25519_PUBLIC_KEY) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  process.env.ED25519_PRIVATE_KEY = Buffer.from(
    privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  ).toString('base64');
  process.env.ED25519_PUBLIC_KEY = Buffer.from(
    publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  ).toString('base64');
}
