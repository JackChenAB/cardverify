import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CardModule } from '../card/card.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    CardModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '12h' },
    }),
  ],
  controllers: [AdminController],
  providers: [AdminService, AuthService, JwtStrategy],
})
export class AdminModule {}
