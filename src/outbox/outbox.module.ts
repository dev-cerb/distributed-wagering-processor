import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { DatabaseTransactionModule } from '../shared/infrastructure/database-transaction.module.js';
import { OutboxEvent } from './entities/outbox-event.entity.js';
import { OutboxEventRepositoryImpl } from './repositories/outbox-event.repository-impl.js';
import { OutboxPublisherService } from './services/outbox-publisher.service.js';
import { OutboxWorkerService } from './services/outbox-worker.service.js';

@Module({
  imports: [
    MikroOrmModule.forFeature([OutboxEvent]),
    DatabaseTransactionModule,
  ],
  providers: [
    OutboxEventRepositoryImpl,
    OutboxPublisherService,
    OutboxWorkerService,
  ],
  exports: [
    OutboxEventRepositoryImpl,
    OutboxPublisherService,
    OutboxWorkerService,
  ],
})
export class OutboxModule {}
