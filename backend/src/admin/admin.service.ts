import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeExtension } from '../card/card-logic';
import { getHeartbeatConfig } from '../config/heartbeat';
import { CardSortBy, ExtendCardsDto, ExtendScope, ListCardsDto, SortOrder } from './admin.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listCards(q: ListCardsDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.CardKeyWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.code) where.code = { contains: q.code.toUpperCase() };
    if (q.hwid) where.hwid = { contains: q.hwid };
    if (q.batchId) where.batchId = q.batchId;

    const orderBy = this.buildOrderBy(q.sortBy, q.sortOrder);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.cardKey.count({ where }),
      this.prisma.cardKey.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { batch: { select: { id: true, name: true } } },
      }),
    ]);
    // Derive online lazily from lastSeenAt (single source of truth = config TTL).
    const onlineCutoff = Date.now() - getHeartbeatConfig().onlineTtlMs;
    const items = rows.map((c) => ({
      ...c,
      online: c.lastSeenAt != null && c.lastSeenAt.getTime() > onlineCutoff,
    }));
    return { total, page, pageSize, items };
  }

  /**
   * Orders by status or expiresAt (the latter also drives the computed
   * "remaining time" column). Default = newest-first by id. For expiresAt,
   * nulls (permanent / not-yet-activated, no finite expiry) sort to the
   * "most remaining" end: last on asc, first on desc.
   */
  private buildOrderBy(
    sortBy: CardSortBy | undefined,
    sortOrder: SortOrder | undefined,
  ): Prisma.CardKeyOrderByWithRelationInput {
    if (!sortBy) return { id: 'desc' };
    const order: 'asc' | 'desc' = sortOrder === SortOrder.ASC ? 'asc' : 'desc';
    if (sortBy === CardSortBy.STATUS) return { status: order };
    return { expiresAt: { sort: order, nulls: order === 'asc' ? 'last' : 'first' } };
  }

  /**
   * Bulk-extends validity. scope='ids' extends the given cards; scope='filter'
   * extends every card matching the filters. Per-card rules live in
   * computeExtension (banned/permanent are skipped). Returns counts.
   */
  async extendCards(dto: ExtendCardsDto): Promise<{ extended: number; skipped: number }> {
    const where: Prisma.CardKeyWhereInput = {};
    if (dto.scope === ExtendScope.IDS) {
      if (!dto.ids || dto.ids.length === 0) {
        throw new BadRequestException('no card ids provided');
      }
      where.id = { in: dto.ids };
    } else {
      if (dto.status) where.status = dto.status;
      if (dto.code) where.code = { contains: dto.code.toUpperCase() };
      if (dto.hwid) where.hwid = { contains: dto.hwid };
      if (dto.batchId) where.batchId = dto.batchId;
    }

    const cards = await this.prisma.cardKey.findMany({ where });
    const now = new Date();
    const updates: Prisma.PrismaPromise<unknown>[] = [];
    let skipped = 0;

    for (const c of cards) {
      const op = computeExtension(c, dto.days, now);
      if (op.skip) {
        skipped++;
        continue;
      }
      const data: Prisma.CardKeyUpdateInput = {};
      if (op.expiresAt) data.expiresAt = op.expiresAt;
      if (op.durationDays != null) data.durationDays = op.durationDays;
      updates.push(this.prisma.cardKey.update({ where: { id: c.id }, data }));
    }

    if (updates.length) await this.prisma.$transaction(updates);
    return { extended: updates.length, skipped };
  }

  private async mustGet(id: number) {
    const card = await this.prisma.cardKey.findUnique({ where: { id } });
    if (!card) throw new NotFoundException('card not found');
    return card;
  }

  async ban(id: number) {
    await this.mustGet(id);
    return this.prisma.cardKey.update({ where: { id }, data: { status: 'BANNED' } });
  }

  /** Restores a banned card to its correct status based on activation/expiry. */
  async unban(id: number) {
    const card = await this.mustGet(id);
    let status: 'UNUSED' | 'ACTIVE' | 'EXPIRED' = 'UNUSED';
    if (card.activatedAt) {
      const expired = card.expiresAt != null && card.expiresAt.getTime() <= Date.now();
      status = expired ? 'EXPIRED' : 'ACTIVE';
    }
    return this.prisma.cardKey.update({ where: { id }, data: { status } });
  }

  /** Clears the bound HWID so the user can re-activate on a new machine,
   *  keeping the remaining time (card stays ACTIVE). */
  async unbind(id: number) {
    await this.mustGet(id);
    return this.prisma.cardKey.update({ where: { id }, data: { hwid: null } });
  }

  async remove(id: number) {
    await this.mustGet(id);
    await this.prisma.cardKey.delete({ where: { id } });
    return { deleted: true };
  }

  /** All numbers computed in the DB (status counts + last 14 days of activations). */
  async stats() {
    const byStatusRaw = await this.prisma.cardKey.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = { UNUSED: 0, ACTIVE: 0, EXPIRED: 0, BANNED: 0 };
    for (const r of byStatusRaw) byStatus[r.status] = r._count._all;

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

    const daily = await this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>(
      Prisma.sql`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "VerifyLog"
        WHERE "action" = 'ACTIVATE' AND "result" = 'OK'
          AND "createdAt" >= now() - interval '14 days'
        GROUP BY 1
        ORDER BY 1
      `,
    );

    return {
      total,
      byStatus,
      activations: daily.map((d) => ({
        day: d.day.toISOString().slice(0, 10),
        count: Number(d.count),
      })),
    };
  }
}
