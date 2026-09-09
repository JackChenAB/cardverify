import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  decideActivate,
  decideVerify,
  generateCode,
  CardLike,
  Decision,
  ResultCode,
} from './card-logic';
import { getHeartbeatConfig } from '../config/heartbeat';

export interface VerifyOutcome {
  valid: boolean;
  result: ResultCode;
  expiresAt: string | null; // ISO string for the wire
}

@Injectable()
export class CardService {
  constructor(private readonly prisma: PrismaService) {}

  async activate(code: string, hwid: string, ip?: string): Promise<VerifyOutcome> {
    return this.run('ACTIVATE', code, hwid, ip, decideActivate);
  }

  async verify(
    code: string,
    hwid: string,
    ip?: string,
    session?: string,
    takeover?: boolean,
  ): Promise<VerifyOutcome> {
    const cfg = getHeartbeatConfig();
    const decide = (card: CardLike, h: string, now: Date) =>
      decideVerify(card, h, now, {
        session,
        takeover,
        policy: cfg.policy,
        sessionStaleMs: cfg.sessionStaleMs,
      });
    return this.run('VERIFY', code, hwid, ip, decide);
  }

  private async run(
    action: 'ACTIVATE' | 'VERIFY',
    code: string,
    hwid: string,
    ip: string | undefined,
    decide: (card: any, hwid: string, now: Date) => Decision,
  ): Promise<VerifyOutcome> {
    const now = new Date();
    let card = await this.prisma.cardKey.findUnique({ where: { code } });

    if (!card) {
      await this.log(action, null, code, hwid, ip, 'NOT_FOUND');
      return { valid: false, result: 'NOT_FOUND', expiresAt: null };
    }

    let decision = decide(card, hwid, now);

    // Apply the atomic state transition implied by the decision.
    if (decision.activate) {
      const upd = await this.prisma.cardKey.updateMany({
        where: { id: card.id, status: 'UNUSED' },
        data: {
          status: 'ACTIVE',
          hwid,
          activatedAt: decision.activate.activatedAt,
          expiresAt: decision.activate.expiresAt,
        },
      });
      if (upd.count === 0) {
        // Lost a race — re-read and re-decide once against the now-current state.
        card = await this.prisma.cardKey.findUnique({ where: { code } });
        if (!card) {
          await this.log(action, null, code, hwid, ip, 'NOT_FOUND');
          return { valid: false, result: 'NOT_FOUND', expiresAt: null };
        }
        decision = decide(card, hwid, now);
      }
    }

    if (decision.markExpired) {
      await this.prisma.cardKey.updateMany({
        where: { id: card.id, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });
    }

    if (decision.rebindHwid) {
      // Only succeeds while the card is still ACTIVE and unbound (race-safe).
      await this.prisma.cardKey.updateMany({
        where: { id: card.id, status: 'ACTIVE', hwid: null },
        data: { hwid: decision.rebindHwid },
      });
    }

    // Heartbeat: refresh online status and resolve the single-instance session.
    if (decision.session) {
      decision = await this.applySession(card.id, hwid, decision, now);
    } else if (decision.heartbeat) {
      // No-session client: just bump lastSeenAt (multi-open detection skipped).
      await this.prisma.cardKey.updateMany({
        where: { id: card.id, status: 'ACTIVE', hwid },
        data: { lastSeenAt: now },
      });
    }

    await this.log(action, card.id, code, hwid, ip, decision.result);
    return {
      valid: decision.valid,
      result: decision.result,
      expiresAt: decision.expiresAt ? decision.expiresAt.toISOString() : null,
    };
  }

  /**
   * Atomically claims/heartbeats the card's single active session (race-safe via
   * updateMany + count). A missed update means either a different *fresh* session
   * holds the card → CONCURRENT_SESSION, or the card drifted out of ACTIVE/hwid
   * between read and write → re-read + re-decide tells them apart.
   */
  private async applySession(
    cardId: number,
    hwid: string,
    decision: Decision,
    now: Date,
  ): Promise<Decision> {
    const s = decision.session!;
    const where: Prisma.CardKeyWhereInput = { id: cardId, status: 'ACTIVE', hwid };
    // kick-old + a process's startup beat steals even a fresh holder. Otherwise
    // only a free / own / stale session can be claimed; a fresh foreign holder
    // makes the update miss (count 0) → conflict.
    if (!(s.takeover && s.policy === 'kick-old')) {
      where.OR = [
        { sessionId: null },
        { sessionId: s.sessionId },
        { sessionSeenAt: { lt: s.staleBefore } },
      ];
    }
    const upd = await this.prisma.cardKey.updateMany({
      where,
      data: { sessionId: s.sessionId, sessionSeenAt: now, lastSeenAt: now },
    });
    if (upd.count > 0) return decision; // claimed / heartbeated OK

    const fresh = await this.prisma.cardKey.findUnique({ where: { id: cardId } });
    const base: Decision = fresh
      ? decideVerify(fresh, hwid, now)
      : { result: 'NOT_FOUND', valid: false, expiresAt: null };
    if (base.result === 'OK') {
      // Still ACTIVE + ours by hwid + time left → the miss was a live rival session.
      return { result: 'CONCURRENT_SESSION', valid: false, expiresAt: base.expiresAt };
    }
    if (base.markExpired) {
      await this.prisma.cardKey.updateMany({
        where: { id: cardId, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });
    }
    return base;
  }

  private async log(
    action: 'ACTIVATE' | 'VERIFY',
    cardId: number | null,
    code: string,
    hwid: string | undefined,
    ip: string | undefined,
    result: string,
  ) {
    await this.prisma.verifyLog.create({
      data: { action, cardId, codeTried: code, hwid, ip, result },
    });
  }

  /**
   * Generates `count` unique cards for a batch. Uses createMany(skipDuplicates)
   * and tops up any collisions until the requested count is inserted.
   */
  async generateBatch(
    adminId: number | null,
    params: { name: string; count: number; durationDays: number | null; note?: string },
  ): Promise<{ batchId: number; codes: string[] }> {
    const { name, count, durationDays, note } = params;
    const batch = await this.prisma.batch.create({
      data: { name, count, durationDays, note, createdById: adminId },
    });

    const created: string[] = [];
    let guard = 0;
    while (created.length < count && guard < 20) {
      guard++;
      const need = count - created.length;
      const codes = new Set<string>();
      while (codes.size < need) codes.add(generateCode());
      const rows = [...codes].map((c) => ({
        code: c,
        durationDays,
        note,
        batchId: batch.id,
      }));
      await this.prisma.cardKey.createMany({ data: rows, skipDuplicates: true });
      // Confirm which of these codes actually landed (skipDuplicates drops collisions).
      const inserted = await this.prisma.cardKey.findMany({
        where: { code: { in: [...codes] }, batchId: batch.id },
        select: { code: true },
      });
      for (const r of inserted) if (!created.includes(r.code)) created.push(r.code);
    }
    return { batchId: batch.id, codes: created };
  }
}
