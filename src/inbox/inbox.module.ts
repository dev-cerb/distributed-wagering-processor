import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { InboxMessage } from './entities/inbox-message.entity.js';
import { InboxMessageRepository } from './repositories/inbox-message.repository.js';
import { DatabaseTransactionModule } from '../shared/infrastructure/database-transaction.module.js';

import { InboxConsumerService } from './inbox-consumer.service.js';
import { WagerProcessingModule } from '../wager-transactions/wager-processing.module.js';

@Module({
  imports: [
    MikroOrmModule.forFeature([InboxMessage]),
    DatabaseTransactionModule,
    WagerProcessingModule,
  ],
  providers: [InboxMessageRepository, InboxConsumerService],
  exports: [InboxMessageRepository],
})
export class InboxModule {}
