import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AdminService } from './admin.service';
import { CardService } from '../card/card.service';
import { CryptoService } from '../crypto/crypto.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CreateBatchDto, ExtendCardsDto, ListCardsDto, LoginDto } from './admin.dto';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly admin: AdminService,
    private readonly card: CardService,
    private readonly crypto: CryptoService,
  ) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Get('pubkey')
  pubkey() {
    return { publicKeyPem: this.crypto.getPublicKeyPem() };
  }

  @UseGuards(JwtAuthGuard)
  @Post('cards/batch')
  createBatch(@Body() dto: CreateBatchDto, @Req() req: Request) {
    const adminId = (req.user as any)?.id ?? null;
    return this.card.generateBatch(adminId, {
      name: dto.name,
      count: dto.count,
      durationDays: dto.durationDays ?? null,
      note: dto.note,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('cards')
  listCards(@Query() q: ListCardsDto) {
    return this.admin.listCards(q);
  }

  @UseGuards(JwtAuthGuard)
  @Post('cards/extend')
  extendCards(@Body() dto: ExtendCardsDto) {
    return this.admin.extendCards(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('cards/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="cards.csv"')
  async exportCards(@Query() q: ListCardsDto) {
    const data = await this.admin.listCards({ ...q, page: 1, pageSize: 200 });
    const header = 'code,status,durationDays,hwid,activatedAt,expiresAt';
    const rows = data.items.map((c: any) =>
      [
        c.code,
        c.status,
        c.durationDays ?? '',
        c.hwid ?? '',
        c.activatedAt?.toISOString?.() ?? '',
        c.expiresAt?.toISOString?.() ?? '',
      ].join(','),
    );
    return [header, ...rows].join('\n');
  }

  @UseGuards(JwtAuthGuard)
  @Patch('cards/:id/ban')
  ban(@Param('id', ParseIntPipe) id: number) {
    return this.admin.ban(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('cards/:id/unban')
  unban(@Param('id', ParseIntPipe) id: number) {
    return this.admin.unban(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('cards/:id/unbind')
  unbind(@Param('id', ParseIntPipe) id: number) {
    return this.admin.unbind(id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('cards/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.admin.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('stats')
  stats() {
    return this.admin.stats();
  }
}
