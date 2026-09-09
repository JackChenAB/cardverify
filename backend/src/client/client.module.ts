import { Module } from '@nestjs/common';
import { CardModule } from '../card/card.module';
import { ClientController } from './client.controller';

@Module({
  imports: [CardModule],
  controllers: [ClientController],
})
export class ClientModule {}
