#!/usr/bin/env node
/**
 * Generates the secrets the system needs and prints them as .env lines:
 *   - APP_SECRET           : HMAC shared secret (embed in the native client)
 *   - ED25519_PRIVATE_KEY  : server response-signing key (base64 PEM, keep secret)
 *   - ED25519_PUBLIC_KEY   : public key (base64 PEM, embed in the native client)
 *   - JWT_SECRET           : admin session signing secret
 *
 * Usage:  node scripts/genkeys.js
 */
const { randomBytes, generateKeyPairSync } = require('crypto');

const appSecret = randomBytes(32).toString('hex');
const jwtSecret = randomBytes(32).toString('hex');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

console.log('# --- generated secrets (paste into .env) ---');
console.log(`APP_SECRET=${appSecret}`);
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`ED25519_PRIVATE_KEY=${Buffer.from(privPem).toString('base64')}`);
console.log(`ED25519_PUBLIC_KEY=${Buffer.from(pubPem).toString('base64')}`);
console.log('\n# --- public key (PEM) to embed in the native client ---');
console.log(pubPem);
