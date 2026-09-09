import { MultiOpenPolicy } from '../card/card-logic';

/**
 * Heartbeat / online-status + multi-open configuration, read from env with
 * sane defaults. Kept out of card-logic.ts so the decision logic stays pure
 * (env access lives in services, mirroring CryptoService).
 */
export interface HeartbeatConfig {
  /** online = lastSeenAt > now - onlineTtlMs */
  onlineTtlMs: number;
  /** a held sessionId older than this (by sessionSeenAt) may be taken over */
  sessionStaleMs: number;
  /** how a second concurrent session for the same card+hwid is resolved */
  policy: MultiOpenPolicy;
}

function secondsEnv(name: string, defSeconds: number): number {
  const raw = process.env[name];
  const n = raw != null ? Number(raw) : NaN;
  return (Number.isFinite(n) && n > 0 ? n : defSeconds) * 1000;
}

export function getHeartbeatConfig(): HeartbeatConfig {
  const policy: MultiOpenPolicy =
    process.env.MULTIOPEN_POLICY === 'block-new' ? 'block-new' : 'kick-old';
  return {
    onlineTtlMs: secondsEnv('HEARTBEAT_ONLINE_TTL_S', 360),
    sessionStaleMs: secondsEnv('SESSION_STALE_TTL_S', 360),
    policy,
  };
}
