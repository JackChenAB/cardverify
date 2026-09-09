import {
  decideActivate,
  decideVerify,
  generateCode,
  computeExpiry,
  computeExtension,
  ExtendInput,
  CardLike,
} from './card-logic';

const now = new Date('2026-06-20T00:00:00.000Z');
const future = new Date('2026-07-20T00:00:00.000Z');
const past = new Date('2026-06-19T00:00:00.000Z');

function card(p: Partial<CardLike>): CardLike {
  return { status: 'UNUSED', hwid: null, durationDays: 30, expiresAt: null, ...p };
}

describe('generateCode', () => {
  it('produces XXXX-XXXX-XXXX-XXXX from the unambiguous alphabet', () => {
    const c = generateCode();
    expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(c).not.toMatch(/[01OI]/);
  });

  it('is overwhelmingly unique across many draws', () => {
    const set = new Set<string>();
    for (let i = 0; i < 5000; i++) set.add(generateCode());
    expect(set.size).toBe(5000);
  });
});

describe('computeExpiry', () => {
  it('returns null for permanent cards', () => {
    expect(computeExpiry(now, null)).toBeNull();
  });
  it('adds the given days', () => {
    expect(computeExpiry(now, 30)!.toISOString()).toBe(future.toISOString());
  });
});

describe('decideActivate', () => {
  it('activates an UNUSED card, binds nothing yet but sets expiry', () => {
    const d = decideActivate(card({ status: 'UNUSED', durationDays: 30 }), 'HW1', now);
    expect(d.result).toBe('OK');
    expect(d.valid).toBe(true);
    expect(d.activate?.activatedAt).toEqual(now);
    expect(d.activate?.expiresAt?.toISOString()).toBe(future.toISOString());
  });

  it('activates a permanent card with null expiry', () => {
    const d = decideActivate(card({ status: 'UNUSED', durationDays: null }), 'HW1', now);
    expect(d.activate?.expiresAt).toBeNull();
    expect(d.expiresAt).toBeNull();
  });

  it('returns OK for an ACTIVE card with the same HWID and time left', () => {
    const d = decideActivate(
      card({ status: 'ACTIVE', hwid: 'HW1', expiresAt: future }),
      'HW1',
      now,
    );
    expect(d.result).toBe('OK');
    expect(d.valid).toBe(true);
  });

  it('re-binds an ACTIVE card that was unbound (hwid null), keeping expiry', () => {
    const d = decideActivate(
      card({ status: 'ACTIVE', hwid: null, expiresAt: future }),
      'HW2',
      now,
    );
    expect(d.result).toBe('OK');
    expect(d.valid).toBe(true);
    expect(d.rebindHwid).toBe('HW2');
    expect(d.expiresAt?.toISOString()).toBe(future.toISOString());
  });

  it('rejects an ACTIVE card used on a different HWID', () => {
    const d = decideActivate(
      card({ status: 'ACTIVE', hwid: 'HW1', expiresAt: future }),
      'HW2',
      now,
    );
    expect(d.result).toBe('HWID_MISMATCH');
    expect(d.valid).toBe(false);
  });

  it('marks an ACTIVE-but-past-expiry card as expired', () => {
    const d = decideActivate(
      card({ status: 'ACTIVE', hwid: 'HW1', expiresAt: past }),
      'HW1',
      now,
    );
    expect(d.result).toBe('EXPIRED');
    expect(d.valid).toBe(false);
    expect(d.markExpired).toBe(true);
  });

  it('rejects a BANNED card', () => {
    const d = decideActivate(card({ status: 'BANNED' }), 'HW1', now);
    expect(d.result).toBe('BANNED');
    expect(d.valid).toBe(false);
  });

  it('rejects an already EXPIRED card', () => {
    const d = decideActivate(card({ status: 'EXPIRED' }), 'HW1', now);
    expect(d.result).toBe('EXPIRED');
    expect(d.valid).toBe(false);
  });
});

describe('decideVerify', () => {
  it('returns NOT_ACTIVATED for an UNUSED card (verify never activates)', () => {
    const d = decideVerify(card({ status: 'UNUSED' }), 'HW1', now);
    expect(d.result).toBe('NOT_ACTIVATED');
    expect(d.valid).toBe(false);
  });

  it('returns OK for an ACTIVE matching card with time left', () => {
    const d = decideVerify(
      card({ status: 'ACTIVE', hwid: 'HW1', expiresAt: future }),
      'HW1',
      now,
    );
    expect(d.result).toBe('OK');
    expect(d.valid).toBe(true);
  });

  it('rejects HWID mismatch', () => {
    const d = decideVerify(
      card({ status: 'ACTIVE', hwid: 'HW1', expiresAt: future }),
      'HWX',
      now,
    );
    expect(d.result).toBe('HWID_MISMATCH');
  });

  it('expires an ACTIVE card past its expiry', () => {
    const d = decideVerify(
      card({ status: 'ACTIVE', hwid: 'HW1', expiresAt: past }),
      'HW1',
      now,
    );
    expect(d.result).toBe('EXPIRED');
    expect(d.markExpired).toBe(true);
  });
});

describe('decideVerify sessions', () => {
  const active = (p: Partial<CardLike> = {}) =>
    card({ status: 'ACTIVE', hwid: 'HW1', expiresAt: future, ...p });

  it('no session opts → heartbeat only, no session intent (backward compat)', () => {
    const d = decideVerify(active(), 'HW1', now);
    expect(d.result).toBe('OK');
    expect(d.heartbeat).toBe(true);
    expect(d.session).toBeUndefined();
  });

  it('claim-when-null: attaches a session intent for the supplied session', () => {
    const d = decideVerify(active({ sessionId: null }), 'HW1', now, { session: 'S1' });
    expect(d.result).toBe('OK');
    expect(d.session?.sessionId).toBe('S1');
  });

  it('heartbeat-same-session: same intent shape as a claim', () => {
    const d = decideVerify(active({ sessionId: 'S1' }), 'HW1', now, { session: 'S1' });
    expect(d.result).toBe('OK');
    expect(d.session?.sessionId).toBe('S1');
  });

  it('staleBefore = now − sessionStaleMs', () => {
    const d = decideVerify(active(), 'HW1', now, { session: 'S1', sessionStaleMs: 90_000 });
    expect(d.session?.staleBefore.getTime()).toBe(now.getTime() - 90_000);
  });

  it('passes policy and takeover through to the intent', () => {
    const d = decideVerify(active(), 'HW1', now, {
      session: 'S1',
      policy: 'kick-old',
      takeover: true,
    });
    expect(d.session?.policy).toBe('kick-old');
    expect(d.session?.takeover).toBe(true);
  });

  it('never returns CONCURRENT_SESSION (that is decided in the service)', () => {
    const d = decideVerify(active({ sessionId: 'OTHER' }), 'HW1', now, { session: 'S1' });
    expect(d.result).toBe('OK');
  });

  it('non-OK paths carry no session intent even when a session is supplied', () => {
    for (const c of [
      card({ status: 'BANNED' }),
      card({ status: 'UNUSED' }),
      card({ status: 'EXPIRED' }),
      active({ expiresAt: past }),
      active({ hwid: 'HWX' }),
    ]) {
      const d = decideVerify(c, 'HW1', now, { session: 'S1' });
      expect(d.result).not.toBe('OK');
      expect(d.session).toBeUndefined();
      expect(d.heartbeat).toBeFalsy();
    }
  });
});

describe('computeExtension', () => {
  const plusDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

  function ext(p: Partial<ExtendInput>): ExtendInput {
    return { status: 'UNUSED', activatedAt: null, expiresAt: null, durationDays: 30, ...p };
  }

  it('skips a BANNED card', () => {
    expect(computeExtension(ext({ status: 'BANNED' }), 7, now).skip).toBe(true);
  });

  it('skips a permanent activated card (no expiry)', () => {
    const r = computeExtension(
      ext({ status: 'ACTIVE', activatedAt: past, expiresAt: null, durationDays: null }),
      7,
      now,
    );
    expect(r.skip).toBe(true);
  });

  it('skips a permanent unused card (no durationDays)', () => {
    expect(computeExtension(ext({ status: 'UNUSED', durationDays: null }), 7, now).skip).toBe(true);
  });

  it('extends an ACTIVE card from its existing expiry', () => {
    const r = computeExtension(
      ext({ status: 'ACTIVE', activatedAt: past, expiresAt: future, durationDays: 30 }),
      7,
      now,
    );
    expect(r.skip).toBe(false);
    expect(r.expiresAt!.toISOString()).toBe(plusDays(future, 7).toISOString());
  });

  it('skips an EXPIRED card (no revive)', () => {
    const r = computeExtension(
      ext({ status: 'EXPIRED', activatedAt: past, expiresAt: past, durationDays: 30 }),
      7,
      now,
    );
    expect(r.skip).toBe(true);
  });

  it('adds days to an UNUSED timed card duration', () => {
    const r = computeExtension(ext({ status: 'UNUSED', durationDays: 30 }), 7, now);
    expect(r.skip).toBe(false);
    expect(r.durationDays).toBe(37);
    expect(r.expiresAt).toBeUndefined();
  });
});
