#!/usr/bin/env node
/**
 * Minimal reference client showing how a native app talks to the verify API.
 * Demonstrates: HMAC request signing + Ed25519 response verification, plus the
 * heartbeat / single-instance (顶号) contract.
 *
 * Usage:
 *   APP_SECRET=...  SERVER_PUBLIC_KEY_PEM="$(cat pub.pem)"  \
 *   node verify.js <activate|verify|heartbeat> <CODE> [hwid] [baseUrl]
 *
 *   activate   one-shot: bind HWID + start the clock on first use
 *   verify     one-shot status check (also a heartbeat)
 *   heartbeat  long-running: claim the session (takeover), then beat every
 *              HEARTBEAT_INTERVAL_S seconds; EXIT if the server reports
 *              CONCURRENT_SESSION (a newer instance took over — 顶号) or invalid.
 *
 * Defaults: hwid = machine-derived id, baseUrl = https://card.smallab.win
 *
 * In a real native client (C++/C#) you would: embed APP_SECRET + the public
 * key in the binary (obfuscated), derive a stable HWID, run the heartbeat loop,
 * and ALWAYS verify the Ed25519 signature before trusting `valid:true`.
 */
const { createHmac, randomBytes, verify: edVerify, createPublicKey } = require('crypto');
const os = require('os');

const APP_SECRET = process.env.APP_SECRET || '';
const PUB_PEM = process.env.SERVER_PUBLIC_KEY_PEM || '';
// One session id per process — distinguishes concurrent instances on the same machine.
const SESSION = process.env.SESSION || `sess-${randomBytes(12).toString('hex')}`;
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_S || 120) * 1000;

function deriveHwid() {
  // Replace with a real, stable hardware fingerprint in production.
  const nets = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && !n.internal && n.mac && n.mac !== '00:00:00:00:00:00')
    .map((n) => n.mac);
  return (nets[0] || os.hostname()).replace(/[^A-Za-z0-9._:-]/g, '');
}

function sign(method, path, body) {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Date.now());
  const nonce = randomBytes(16).toString('hex');
  const message = `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${rawBody}`;
  const signature = createHmac('sha256', APP_SECRET).update(message, 'utf8').digest('hex');
  return { rawBody, headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-nonce': nonce, 'x-signature': signature } };
}

// Signs + sends one request and returns the (signature-verified) response data.
async function callOnce(action, code, hwid, baseUrl, extra = {}) {
  const path = `/api/v1/${action}`;
  const body = { code, hwid, ...extra };
  const { rawBody, headers } = sign('POST', path, body);

  const res = await fetch(baseUrl + path, { method: 'POST', headers, body: rawBody });
  const env = await res.json();
  if (res.status === 401) throw new Error(`request rejected: ${JSON.stringify(env)}`);

  // The crucial step: trust the answer ONLY if the signature checks out.
  if (PUB_PEM) {
    const ok = edVerify(null, Buffer.from(env.payload, 'utf8'), createPublicKey(PUB_PEM), Buffer.from(env.sig, 'base64'));
    if (!ok) throw new Error('SERVER SIGNATURE INVALID — refusing to trust response');
  } else {
    console.warn('WARNING: SERVER_PUBLIC_KEY_PEM not set — signature NOT verified (insecure).');
  }
  return JSON.parse(env.payload);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Long-running heartbeat: claim the session, then beat until kicked or invalid.
async function heartbeatLoop(code, hwid, baseUrl) {
  console.log(`session: ${SESSION}  interval: ${HEARTBEAT_INTERVAL_MS / 1000}s`);
  // First beat takes over (顶号): kicks any older instance holding this card.
  let takeover = true;
  for (;;) {
    const data = await callOnce('verify', code, hwid, baseUrl, { session: SESSION, takeover });
    console.log(`[${new Date().toISOString()}] result: ${data.result} valid: ${data.valid}`);
    if (data.result === 'CONCURRENT_SESSION') {
      console.error('kicked by a newer instance (顶号) — exiting.');
      process.exit(3);
    }
    if (!data.valid) {
      console.error(`license no longer valid (${data.result}) — exiting.`);
      process.exit(1);
    }
    takeover = false; // subsequent beats only maintain the session
    await sleep(HEARTBEAT_INTERVAL_MS);
  }
}

async function main() {
  const [action = 'activate', code, hwidArg, baseUrl = 'https://card.smallab.win'] = process.argv.slice(2);
  if (!APP_SECRET) throw new Error('Set APP_SECRET');
  if (!code) throw new Error('Usage: node verify.js <activate|verify|heartbeat> <CODE> [hwid] [baseUrl]');
  const hwid = hwidArg || deriveHwid();
  console.log('hwid:', hwid);

  if (action === 'heartbeat') {
    await heartbeatLoop(code, hwid, baseUrl);
    return;
  }

  // One-shot activate/verify. verify carries the session id for online tracking.
  const extra = action === 'verify' ? { session: SESSION } : {};
  const data = await callOnce(action, code, hwid, baseUrl, extra);
  console.log('result:', data);
  process.exit(data.valid ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(2);
});
