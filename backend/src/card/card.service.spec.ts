import { CardService } from './card.service';

/**
 * In-memory fake of the Prisma methods CardService.run uses, with a faithful
 * `updateMany` where-matcher (supports id/code/status/hwid/sessionId/sessionSeenAt{lt}
 * and OR). This exercises the race-safe session-claim semantics that the pure
 * decideVerify cannot — count===1 vs count===0 is the whole conflict verdict.
 */
type Row = Record<string, any>;

function matchPredicate(row: Row, pred: Row): boolean {
  return Object.entries(pred).every(([k, v]) => {
    if (k === 'OR') return (v as Row[]).some((sub) => matchPredicate(row, sub));
    if (v !== null && typeof v === 'object' && 'lt' in v) {
      return row[k] != null && row[k].getTime() < (v.lt as Date).getTime();
    }
    return row[k] === v; // handles value match and explicit null
  });
}

class FakePrisma {
  rows: Row[] = [];
  logs: Row[] = [];

  cardKey = {
    findUnique: async ({ where }: { where: Row }) => {
      const r = this.rows.find((x) =>
        where.code !== undefined ? x.code === where.code : x.id === where.id,
      );
      return r ? { ...r } : null;
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      let count = 0;
      for (const r of this.rows) {
        if (matchPredicate(r, where)) {
          Object.assign(r, data);
          count++;
        }
      }
      return { count };
    },
  };

  verifyLog = {
    create: async ({ data }: { data: Row }) => {
      this.logs.push(data);
      return data;
    },
  };
}

function activeCard(over: Row = {}): Row {
  return {
    id: 1,
    code: 'CODE-0001',
    status: 'ACTIVE',
    hwid: 'HW',
    durationDays: 30,
    expiresAt: new Date(Date.now() + 30 * 86400000),
    sessionId: null,
    sessionSeenAt: null,
    lastSeenAt: null,
    ...over,
  };
}

describe('CardService heartbeat sessions', () => {
  let prisma: FakePrisma;
  let svc: CardService;

  beforeEach(() => {
    delete process.env.MULTIOPEN_POLICY; // default kick-old
    delete process.env.SESSION_STALE_TTL_S; // default 360s
    prisma = new FakePrisma();
    svc = new CardService(prisma as any);
  });

  it('claims the session and stamps lastSeenAt on first verify', async () => {
    prisma.rows.push(activeCard());
    const out = await svc.verify('CODE-0001', 'HW', '1.1.1.1', 'S1', true);
    expect(out.result).toBe('OK');
    expect(out.valid).toBe(true);
    expect(prisma.rows[0].sessionId).toBe('S1');
    expect(prisma.rows[0].lastSeenAt).toBeInstanceOf(Date);
  });

  it('same-session heartbeat is idempotent OK', async () => {
    prisma.rows.push(activeCard());
    await svc.verify('CODE-0001', 'HW', undefined, 'S1', true);
    const first = prisma.rows[0].lastSeenAt as Date;
    await new Promise((r) => setTimeout(r, 5));
    const out = await svc.verify('CODE-0001', 'HW', undefined, 'S1', false);
    expect(out.result).toBe('OK');
    expect(prisma.rows[0].sessionId).toBe('S1');
    expect((prisma.rows[0].lastSeenAt as Date).getTime()).toBeGreaterThanOrEqual(first.getTime());
  });

  it('顶号: a startup beat takes over, and the old session is then kicked', async () => {
    prisma.rows.push(activeCard());
    await svc.verify('CODE-0001', 'HW', undefined, 'S1', true); // S1 holds
    const takeover = await svc.verify('CODE-0001', 'HW', undefined, 'S2', true);
    expect(takeover.result).toBe('OK');
    expect(prisma.rows[0].sessionId).toBe('S2');
    // S1's next maintain-beat discovers it lost the slot.
    const kicked = await svc.verify('CODE-0001', 'HW', undefined, 'S1', false);
    expect(kicked.result).toBe('CONCURRENT_SESSION');
    expect(kicked.valid).toBe(false);
    expect(prisma.rows[0].sessionId).toBe('S2'); // unchanged
  });

  it('silently takes over a stale (offline) session without a takeover flag', async () => {
    prisma.rows.push(
      activeCard({ sessionId: 'S1', sessionSeenAt: new Date(Date.now() - 10 * 60_000) }),
    );
    const out = await svc.verify('CODE-0001', 'HW', undefined, 'S2', false);
    expect(out.result).toBe('OK');
    expect(prisma.rows[0].sessionId).toBe('S2');
  });

  it('block-new policy: a fresh holder is kept, the newcomer is rejected', async () => {
    process.env.MULTIOPEN_POLICY = 'block-new';
    prisma.rows.push(activeCard({ sessionId: 'S1', sessionSeenAt: new Date() }));
    const out = await svc.verify('CODE-0001', 'HW', undefined, 'S2', true);
    expect(out.result).toBe('CONCURRENT_SESSION');
    expect(prisma.rows[0].sessionId).toBe('S1');
  });

  it('no-session client still heartbeats lastSeenAt (multi-open detection skipped)', async () => {
    prisma.rows.push(activeCard());
    const out = await svc.verify('CODE-0001', 'HW');
    expect(out.result).toBe('OK');
    expect(prisma.rows[0].lastSeenAt).toBeInstanceOf(Date);
    expect(prisma.rows[0].sessionId).toBeNull();
  });
});
