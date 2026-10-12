import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseTransactionService } from '../../shared/infrastructure/database-transaction.service.js';
import { OutboxEvent } from '../entities/outbox-event.entity.js';
import { OutboxEventRepositoryImpl } from '../repositories/outbox-event.repository-impl.js';

@Injectable()
export class OutboxPublisherService implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;

  private readonly leaseDurationSeconds = 60;

  constructor(
    private readonly em: EntityManager,
    private readonly configService: ConfigService,
    private readonly databaseTransaction: DatabaseTransactionService,
    private readonly outboxRepository: OutboxEventRepositoryImpl,
  ) {
    this.queueUrl = this.configService.getOrThrow<string>(
      'SQS_WAGER_TRANSACTIONS_QUEUE_URL',
    );

    this.sqsClient = new SQSClient({
      region: this.configService.getOrThrow<string>('AWS_REGION'),
      endpoint: this.configService.get<string>('AWS_ENDPOINT_URL'),
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.sqsClient.destroy();
  }

  async publishPendingEvents(limit = 10): Promise<void> {
    const events = await this.databaseTransaction.execute(
      async (transactionalEm) =>
        this.outboxRepository.claimPending(
          limit,
          this.leaseDurationSeconds,
          transactionalEm,
        ),
    );

    for (const event of events) {
      await this.publishEvent(event);
    }
  }

  async publishEventById(eventId: string): Promise<void> {
    const event = await this.databaseTransaction.execute(
      async (transactionalEm) =>
        this.outboxRepository.claimPendingById(
          eventId,
          this.leaseDurationSeconds,
          transactionalEm,
        ),
    );

    if (!event) {
      throw new Error(`Outbox event could not be claimed: ${eventId}`);
    }

    await this.publishEvent(event);
  }

  private async publishEvent(event: OutboxEvent): Promise<void> {
    if (!event.leaseToken) {
      this.logger.error(
        `Cannot publish outbox event without a lease token: ${event.id}`,
      );
      return;
    }

    const leaseToken = event.leaseToken;

    try {
      await this.sqsClient.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify({
            eventId: event.id,
            eventType: event.eventType,
            payload: event.payload,
          }),
          MessageGroupId: event.eventType,
          MessageDeduplicationId: event.id,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Failed to publish outbox event ${event.id}: ${message}`,
      );

      await this.databaseTransaction.execute(async (transactionalEm) => {
        await this.outboxRepository.markFailed(
          event.id,
          leaseToken,
          message,
          transactionalEm,
        );
      });

      return;
    }

    await this.databaseTransaction.execute(async (transactionalEm) => {
      await this.outboxRepository.markPublished(
        event.id,
        leaseToken,
        transactionalEm,
      );
    });
  }
}
