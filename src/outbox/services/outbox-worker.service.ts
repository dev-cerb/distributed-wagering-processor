import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { OutboxPublisherService } from './outbox-publisher.service.js';

@Injectable()
export class OutboxWorkerService {
  private readonly logger = new Logger(OutboxWorkerService.name);
  private isRunning = false;

  constructor(
    private readonly outboxPublisherService: OutboxPublisherService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async processPendingEvents(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      await this.outboxPublisherService.publishPendingEvents();
    } catch (error) {
      this.logger.error(
        'Failed to process pending outbox events',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
  }
}
