// Demo / mock backend — enabled when VITE_DEMO is set. Lets the whole admin UI
// be browsed with fake in-memory data, no backend or database required.
// This module is tree-shaken out of production builds (VITE_DEMO unset).
import type { CardItem } from './index';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode(): string {
  const part = () =>
    Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  return [part(), part(), part(), part()].join('-');
}

function daysFromNow(d: number): string {
  return new Date(Date.now() + d * 86400000).toISOString();
}

let seq = 1;
function makeCard(p: Partial<CardItem>): CardItem {
  return {
    id: seq++,
    code: genCode(),
    status: 'UNUSED',
    durationDays: 30,
    hwid: null,
    activatedAt: null,
    expiresAt: null,
    lastSeenAt: null,
    sessionId: null,
    online: false,
    note: null,
    batch: { id: 1, name: 'demo 批次' },
    createdAt: new Date().toISOString(),
    ...p,
  };
}

// Seed a spread of statuses so every UI state is visible.
const cards: CardItem[] = [
  ...Array.from({ length: 6 }, () => makeCard({ status: 'UNUSED' })),
  ...Array.from({ length: 8 }, (_, i) =>
    makeCard({
      status: 'ACTIVE',
      hwid: `HW-${1000 + i}`,
      activatedAt: daysFromNow(-5),
      expiresAt: daysFromNow(25),
      // Half online (heartbeating now), half seen a while ago — shows both states.
      lastSeenAt: i % 2 === 0 ? new Date().toISOString() : daysFromNow(-1),
      sessionId: `sess-${1000 + i}`,
      online: i % 2 === 0,
    }),
  ),
  ...Array.from({ length: 3 }, () =>
    makeCard({ status: 'EXPIRED', hwid: 'HW-OLD', activatedAt: daysFromNow(-40), expiresAt: daysFromNow(-10) }),
  ),
  ...Array.from({ length: 2 }, () => makeCard({ status: 'BANNED', durationDays: null, note: '違規' })),
];

const delay = <T>(v: T): Promise<T> => new Promise((r) => setTimeout(() => r(v), 150));
const byId = (id: number) => cards.find((c) => c.id === id);

export const adminApiMock = {
  login: (username: string) =>
    delay({ access_token: 'demo-token', username: username || 'admin', role: 'admin' }),

  listCards: (params: Record<string, any>) => {
    let list = cards.slice().reverse();
    if (params.status) list = list.filter((c) => c.status === params.status);
    if (params.code) list = list.filter((c) => c.code.includes(String(params.code).toUpperCase()));
    if (params.hwid) list = list.filter((c) => (c.hwid ?? '').includes(String(params.hwid)));
    if (params.sortBy) {
      const dir = params.sortOrder === 'asc' ? 1 : -1;
      // 'status' sorts by the enum's lifecycle order; 'expiresAt' (also backs
      // "remaining") sorts by expiry, nulls to the most-remaining end.
      const ORDER = ['UNUSED', 'ACTIVE', 'EXPIRED', 'BANNED'];
      list = list.slice().sort((a, b) => {
        if (params.sortBy === 'status') return (ORDER.indexOf(a.status) - ORDER.indexOf(b.status)) * dir;
        const av = a.expiresAt ? Date.parse(a.expiresAt) : Infinity;
        const bv = b.expiresAt ? Date.parse(b.expiresAt) : Infinity;
        return (av - bv) * dir;
      });
    }
    const page = Number(params.page ?? 1);
    const pageSize = Number(params.pageSize ?? 20);
    const total = list.length;
    const items = list.slice((page - 1) * pageSize, page * pageSize);
    return delay({ total, page, pageSize, items });
  },

  createBatch: (payload: { name: string; count: number; durationDays: number | null; note?: string }) => {
    const codes: string[] = [];
    for (let i = 0; i < payload.count; i++) {
      const c = makeCard({
        status: 'UNUSED',
        durationDays: payload.durationDays,
        note: payload.note ?? null,
        batch: { id: 99, name: payload.name },
      });
      cards.push(c);
      codes.push(c.code);
    }
    return delay({ batchId: 99, codes });
  },

  ban: (id: number) => {
    const c = byId(id);
    if (c) c.status = 'BANNED';
    return delay({ ok: true });
  },
  unban: (id: number) => {
    const c = byId(id);
    if (c) c.status = c.activatedAt ? 'ACTIVE' : 'UNUSED';
    return delay({ ok: true });
  },
  unbind: (id: number) => {
    const c = byId(id);
    if (c) c.hwid = null;
    return delay({ ok: true });
  },
  remove: (id: number) => {
    const i = cards.findIndex((c) => c.id === id);
    if (i >= 0) cards.splice(i, 1);
    return delay({ deleted: true });
  },

  extendCards: (payload: Record<string, any>) => {
    const now = Date.now();
    let target: CardItem[];
    if (payload.scope === 'ids') {
      const ids: number[] = payload.ids ?? [];
      target = cards.filter((c) => ids.includes(c.id));
    } else {
      target = cards.filter(
        (c) =>
          (!payload.status || c.status === payload.status) &&
          (!payload.code || c.code.includes(String(payload.code).toUpperCase())) &&
          (!payload.hwid || (c.hwid ?? '').includes(String(payload.hwid))),
      );
    }
    let extended = 0;
    let skipped = 0;
    for (const c of target) {
      if (c.status === 'BANNED' || c.status === 'EXPIRED') {
        skipped++;
        continue;
      }
      if (c.activatedAt) {
        if (!c.expiresAt) {
          skipped++;
          continue;
        }
        const base = Math.max(now, Date.parse(c.expiresAt));
        c.expiresAt = new Date(base + payload.days * 86400000).toISOString();
        extended++;
      } else {
        if (c.durationDays == null) {
          skipped++;
          continue;
        }
        c.durationDays += payload.days;
        extended++;
      }
    }
    return delay({ extended, skipped });
  },

  stats: () => {
    const byStatus = { UNUSED: 0, ACTIVE: 0, EXPIRED: 0, BANNED: 0 } as Record<string, number>;
    for (const c of cards) byStatus[c.status]++;
    const activations = Array.from({ length: 14 }, (_, i) => ({
      day: new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10),
      count: Math.floor(Math.random() * 8),
    }));
    return delay({ total: cards.length, byStatus, activations });
  },

  pubkey: () =>
    delay({
      publicKeyPem:
        '-----BEGIN PUBLIC KEY-----\nDEMO_PLACEHOLDER_USE_BACKEND_ED25519_PUBLIC_KEY\n-----END PUBLIC KEY-----',
    }),

  exportCsv: async (params: Record<string, any>) => {
    const { items } = await adminApiMock.listCards({ ...params, page: 1, pageSize: 9999 });
    const header = 'code,status,durationDays,hwid,activatedAt,expiresAt';
    const rows = items.map((c) =>
      [c.code, c.status, c.durationDays ?? '', c.hwid ?? '', c.activatedAt ?? '', c.expiresAt ?? ''].join(','),
    );
    return new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
  },
};
