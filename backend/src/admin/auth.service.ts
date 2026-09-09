import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Seeds the default admin from env on first boot if no admin exists. */
  async onModuleInit() {
    const count = await this.prisma.admin.count();
    if (count > 0) return;
    const username = process.env.ADMIN_USERNAME ?? 'admin';
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
      this.logger.warn('No admin exists and ADMIN_PASSWORD is unset — create one manually.');
      return;
    }
    await this.prisma.admin.create({
      data: { username, passwordHash: await bcrypt.hash(password, 10) },
    });
    this.logger.log(`Seeded default admin "${username}".`);
  }

  async login(username: string, password: string) {
    const admin = await this.prisma.admin.findUnique({ where: { username } });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      throw new UnauthorizedException('invalid credentials');
    }
    const token = await this.jwt.signAsync({
      sub: admin.id,
      username: admin.username,
      role: admin.role,
    });
    return { access_token: token, username: admin.username, role: admin.role };
  }
}
