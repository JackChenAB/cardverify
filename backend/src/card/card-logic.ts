import { randomBytes } from 'crypto';

// Unambiguous alphabet (no 0/O/1/I) for human-typeable codes.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type CardStatusLike = 'UNUSED' | 'ACTIVE' | 'EXPIRED' | 'BANNED';

export interface CardLike {
  status: CardStatusLike;
  hwid: string | null;
  durationDays: number | null;
  expiresAt: Date | null;
  /** Currently-active client session token (heartbeat). */
  sessionId?: string | null;
  /** When that session was last refreshed. */
  sessionSeenAt?: Date | null;
}

export type ResultCode =
  | 'OK'
  | 'NOT_FOUND'
  | 'BANNED'
  | 'EXPIRED'
  | 'HWID_MISMATCH'
  | 'NOT_ACTIVATED'
  | 'CONCURRENT_SESSION';

/** How a second concurrent session for the same card+hwid is resolved. */
export type MultiOpenPolicy = 'kick-old' | 'block-new';

/** Default window after which a held session is considered stale (ms). */
export const DEFAULT_SESSION_STALE_MS = 360_000;

/** A claim/heartbeat the service should attempt atomically (only on an OK verify). */
export interface SessionIntent {
  /** Session id to claim/heartbeat (echoed from the request). */
  sessionId: string;
  policy: MultiOpenPolicy;
  /** true on a process's startup beat — under kick-old it steals a fresh holder. */
  takeover: boolean;
  /** Sessions whose sessionSeenAt is before this may be taken over. */
  staleBefore: Date;
}

export interface VerifyOptions {
  session?: string | null;
  takeover?: boolean;
  policy?: MultiOpenPolicy;
  sessionStaleMs?: number;
}

export interface Decision {
  result: ResultCode;
  valid: boolean;
  /** When set, the UNUSED card should be activated with these values. */
  activate?: { activatedAt: Date; expiresAt: Date | null };
  /** When true, an ACTIVE card crossed its expiry and should be marked EXPIRED. */
  markExpired?: boolean;
  /** When set, bind this HWID to an ACTIVE card that was unbound by an admin. */
  rebindHwid?: string;
  /** When true, an OK verify — the service should refresh lastSeenAt. */
  heartbeat?: boolean;
  /** When set (a session was supplied), drives the atomic session claim. */
  session?: SessionIntent;
  /** Effective expiry to report to the client (null = permanent). */
  expiresAt: Date | null;
}

/** Generates a code like ABCD-EF23-...  with `groups` groups of `size` chars. */
export function generateCode(groups = 4, size = 4): string {
  const out: string[] = [];
  for (let g = 0; g < groups; g++) {
    let part = '';
    const buf = randomBytes(size);
    for (let i = 0; i < size; i++) part += ALPHABET[buf[i] % ALPHABET.length];
    out.push(part);
  }
  return out.join('-');
}

export function computeExpiry(now: Date, durationDays: number | null): Date | null {
  if (durationDays == null) return null; // permanent
  return new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
}

function isExpired(card: CardLike, now: Date): boolean {
  return card.expiresAt != null && card.expiresAt.getTime() <= now.getTime();
}

/** Decision for the activate endpoint (binds HWID + starts the clock on first use). */
export function decideActivate(card: CardLike, hwid: string, now: Date): Decision {
  switch (card.status) {
    case 'BANNED':
      return { result: 'BANNED', valid: false, expiresAt: card.expiresAt };
    case 'UNUSED': {
      const expiresAt = computeExpiry(now, card.durationDays);
      return {
        result: 'OK',
        valid: true,
        activate: { activatedAt: now, expiresAt },
        expiresAt,
      };
    }
    case 'EXPIRED':
      return { result: 'EXPIRED', valid: false, expiresAt: card.expiresAt };
    case 'ACTIVE':
      if (isExpired(card, now)) {
        return { result: 'EXPIRED', valid: false, markExpired: true, expiresAt: card.expiresAt };
      }
      // Admin unbound this card (hwid cleared) — let the next machine re-bind,
      // keeping the remaining time rather than restarting the clock.
      if (card.hwid == null) {
        return { result: 'OK', valid: true, rebindHwid: hwid, expiresAt: card.expiresAt };
      }
      if (card.hwid !== hwid) {
        return { result: 'HWID_MISMATCH', valid: false, expiresAt: card.expiresAt };
      }
      return { result: 'OK', valid: true, expiresAt: card.expiresAt };
  }
}

/**
 * Decision for the verify (heartbeat) endpoint — never activates an UNUSED card.
 *
 * On an OK verify it sets `heartbeat` (refresh lastSeenAt) and, when a `session`
 * is supplied, attaches a `SessionIntent`. The pure function NEVER returns
 * CONCURRENT_SESSION — that verdict is produced by the service when the atomic
 * session claim loses a race (a different, still-fresh session holds the card).
 */
export function decideVerify(
  card: CardLike,
  hwid: string,
  now: Date,
  opts: VerifyOptions = {},
): Decision {
  switch (card.status) {
    case 'BANNED':
      return { result: 'BANNED', valid: false, expiresAt: card.expiresAt };
    case 'UNUSED':
      return { result: 'NOT_ACTIVATED', valid: false, expiresAt: card.expiresAt };
    case 'EXPIRED':
      return { result: 'EXPIRED', valid: false, expiresAt: card.expiresAt };
    case 'ACTIVE':
      if (isExpired(card, now)) {
        return { result: 'EXPIRED', valid: false, markExpired: true, expiresAt: card.expiresAt };
      }
      if (card.hwid !== hwid) {
        return { result: 'HWID_MISMATCH', valid: false, expiresAt: card.expiresAt };
      }
      const decision: Decision = {
        result: 'OK',
        valid: true,
        heartbeat: true,
        expiresAt: card.expiresAt,
      };
      if (opts.session) {
        decision.session = {
          sessionId: opts.session,
          policy: opts.policy ?? 'kick-old',
          takeover: opts.takeover ?? false,
          staleBefore: new Date(now.getTime() - (opts.sessionStaleMs ?? DEFAULT_SESSION_STALE_MS)),
        };
      }
      return decision;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExtendInput {
  status: CardStatusLike;
  activatedAt: Date | null;
  expiresAt: Date | null;
  durationDays: number | null;
}

export interface ExtendOp {
  /** true = leave the card untouched (expired / banned / permanent). */
  skip: boolean;
  /** New expiry for an activated card. */
  expiresAt?: Date;
  /** New grant for an unused (not-yet-activated) timed card. */
  durationDays?: number;
}

/**
 * Computes how to extend one card by `days`. Adds time regardless of whether
 * the card is activated, EXCEPT:
 *  - EXPIRED: skipped (never revived).
 *  - BANNED: skipped.
 *  - permanent (no duration & no expiry): skipped (nothing finite to extend).
 * Otherwise: activated → expiresAt = max(now, expiresAt) + days;
 *            unused    → durationDays += days.
 */
export function computeExtension(card: ExtendInput, days: number, now: Date): ExtendOp {
  if (card.status === 'BANNED' || card.status === 'EXPIRED') return { skip: true };

  if (card.activatedAt) {
    if (card.expiresAt == null) return { skip: true }; // permanent (activated)
    const base = card.expiresAt.getTime() > now.getTime() ? card.expiresAt : now;
    return { skip: false, expiresAt: new Date(base.getTime() + days * DAY_MS) };
  }

  // Not activated yet (UNUSED).
  if (card.durationDays == null) return { skip: true }; // permanent (unused)
  return { skip: false, durationDays: card.durationDays + days };
}
