import { Test, TestingModule } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../../app.module.js';
import {
  OutboxEvent,
  OutboxEventStatus,
} from '../entities/outbox-event.entity.js';

import { OutboxEventRepositoryImpl } from '../repositories/outbox-event.repository-impl.js';

import { OutboxPublisherService } from './outbox-publisher.service.js';

describe('OutboxPublisherService integration', () => {
  let module: TestingModule;
  let orm: MikroORM<PostgreSqlDriver>;
  let publisher: OutboxPublisherService;
  let sqsClient: SQSClient;
  let queueUrl: string;
  let outboxRepository: OutboxEventRepositoryImpl;

  const previousQueueUrl = process.env.SQS_WAGER_TRANSACTIONS_QUEUE_URL;

  beforeAll(async () => {
    const region = process.env.AWS_REGION ?? 'us-east-1';
    const endpoint = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566';

    sqsClient = new SQSClient({
      region,
      endpoint,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    });

    const queueName = `outbox-integration-${randomUUID()}.fifo`;

    const queue = await sqsClient.send(
      new CreateQueueCommand({
        QueueName: queueName,
        Attributes: {
          FifoQueue: 'true',
          ContentBasedDeduplication: 'false',
        },
      }),
    );

    if (!queue.QueueUrl) {
      throw new Error('SQS did not return the integration queue URL');
    }

    queueUrl = queue.QueueUrl;
    process.env.SQS_WAGER_TRANSACTIONS_QUEUE_URL = queueUrl;

    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    orm = module.get(MikroORM);
    publisher = module.get(OutboxPublisherService);
    outboxRepository = module.get(OutboxEventRepositoryImpl);
  });

  afterAll(async () => {
    if (orm) {
      await orm.close(true);
    }

    if (module) {
      await module.close();
    }

    if (queueUrl) {
      await sqsClient.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
    }

    if (previousQueueUrl === undefined) {
      delete process.env.SQS_WAGER_TRANSACTIONS_QUEUE_URL;
    } else {
      process.env.SQS_WAGER_TRANSACTIONS_QUEUE_URL = previousQueueUrl;
    }

    sqsClient?.destroy();
  });

  it('should publish a persisted event and mark it as published', async () => {
    const event = new OutboxEvent();
    event.eventType = 'OutboxIntegrationTest';
    event.payload = {
      testId: randomUUID(),
      description: 'Real PostgreSQL and SQS integration test',
    };

    const writeEm = orm.em.fork();

    try {
      await writeEm.persist(event);
      await writeEm.flush();
    } finally {
      writeEm.clear();
    }

    await publisher.publishEventById(event.id);

    const checkEm = orm.em.fork();

    try {
      const persistedEvent = await checkEm.findOneOrFail(OutboxEvent, {
        id: event.id,
      });

      expect(persistedEvent.status).toBe(OutboxEventStatus.Published);
      expect(persistedEvent.publishedAt).not.toBeNull();
      expect(persistedEvent.lastError).toBeNull();

      const response = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 5,
        }),
      );

      const message = response.Messages?.find((item) => {
        if (!item.Body) {
          return false;
        }

        const body = JSON.parse(item.Body) as { eventId?: string };
        return body.eventId === event.id;
      });

      expect(message).toBeDefined();

      const body = JSON.parse(message!.Body!) as {
        eventId: string;
        eventType: string;
        payload: Record<string, unknown>;
      };

      expect(body.eventId).toBe(event.id);
      expect(body.eventType).toBe('OutboxIntegrationTest');
      expect(body.payload).toEqual(event.payload);
    } finally {
      checkEm.clear();
    }
  });

  it('should allow only one concurrent claim for the same event', async () => {
    const event = new OutboxEvent();
    event.eventType = 'OutboxConcurrencyTest';
    event.payload = { testId: randomUUID() };

    const writeEm = orm.em.fork();

    try {
      await writeEm.persist(event);
      await writeEm.flush();
    } finally {
      writeEm.clear();
    }

    const firstEm = orm.em.fork();
    const secondEm = orm.em.fork();

    try {
      const results = await Promise.all([
        firstEm.transactional((transactionalEm) =>
          outboxRepository.claimPendingById(event.id, 60, transactionalEm),
        ),
        secondEm.transactional((transactionalEm) =>
          outboxRepository.claimPendingById(event.id, 60, transactionalEm),
        ),
      ]);

      const successfulClaims = results.filter((result) => result !== null);

      expect(successfulClaims).toHaveLength(1);

      const checkEm = orm.em.fork();

      try {
        const persistedEvent = await checkEm.findOneOrFail(OutboxEvent, {
          id: event.id,
        });

        expect(persistedEvent.status).toBe(OutboxEventStatus.Processing);
        expect(persistedEvent.leaseUntil).not.toBeNull();
        expect(persistedEvent.leaseUntil!.getTime()).toBeGreaterThan(
          Date.now(),
        );
      } finally {
        checkEm.clear();
      }
    } finally {
      firstEm.clear();
      secondEm.clear();
    }
  });

  it('should reclaim an event after its lease expires', async () => {
    const event = new OutboxEvent();
    event.eventType = 'OutboxLeaseRecoveryTest';
    event.payload = { testId: randomUUID() };

    const writeEm = orm.em.fork();

    try {
      await writeEm.persist(event);
      await writeEm.flush();
    } finally {
      writeEm.clear();
    }

    const firstEm = orm.em.fork();

    try {
      const firstClaim = await firstEm.transactional((transactionalEm) =>
        outboxRepository.claimPendingById(event.id, 60, transactionalEm),
      );

      expect(firstClaim).not.toBeNull();
    } finally {
      firstEm.clear();
    }

    // Expira a reserva diretamente no PostgreSQL real.
    const expireEm = orm.em.fork();

    try {
      await expireEm.getConnection().execute(
        `
        UPDATE outbox_events
        SET lease_until = NOW() - INTERVAL '1 second'
        WHERE id = ?
      `,
        [event.id],
      );
    } finally {
      expireEm.clear();
    }

    const secondEm = orm.em.fork();

    try {
      const secondClaim = await secondEm.transactional((transactionalEm) =>
        outboxRepository.claimPendingById(event.id, 60, transactionalEm),
      );

      expect(secondClaim).not.toBeNull();
      expect(secondClaim!.id).toBe(event.id);
      expect(secondClaim!.status).toBe(OutboxEventStatus.Processing);
      expect(secondClaim!.leaseUntil).not.toBeNull();
      expect(secondClaim!.leaseUntil!.getTime()).toBeGreaterThan(Date.now());
    } finally {
      secondEm.clear();
    }
  });

  it('should schedule a retry and prevent claiming before nextAttemptAt', async () => {
    const event = new OutboxEvent();
    event.eventType = 'OutboxBackoffTest';
    event.payload = { testId: randomUUID() };

    const writeEm = orm.em.fork();

    try {
      await writeEm.persist(event);
      await writeEm.flush();
    } finally {
      writeEm.clear();
    }

    const tokenClaimEm = orm.em.fork();
    let leaseToken: string;

    try {
      const claimedEvent = await tokenClaimEm.transactional((transactionalEm) =>
        outboxRepository.claimPendingById(event.id, 60, transactionalEm),
      );

      if (!claimedEvent?.leaseToken) {
        throw new Error('Could not claim event or retrieve lease token');
      }

      leaseToken = claimedEvent.leaseToken;
    } finally {
      tokenClaimEm.clear();
    }

    const failureEm = orm.em.fork();

    try {
      await failureEm.transactional((transactionalEm) =>
        outboxRepository.markFailed(
          event.id,
          leaseToken,
          'Simulated SQS failure',
          transactionalEm,
        ),
      );
    } finally {
      failureEm.clear();
    }

    const checkEm = orm.em.fork();

    try {
      const persistedEvent = await checkEm.findOneOrFail(OutboxEvent, {
        id: event.id,
      });

      expect(persistedEvent.attempts).toBe(1);
      expect(persistedEvent.status).toBe(OutboxEventStatus.Pending);
      expect(persistedEvent.lastError).toBe('Simulated SQS failure');
      expect(persistedEvent.leaseUntil).toBeNull();
      expect(persistedEvent.nextAttemptAt).not.toBeNull();

      // A primeira falha deve agendar a próxima tentativa para ~1 segundo.
      const delayMs = persistedEvent.nextAttemptAt!.getTime() - Date.now();

      expect(delayMs).toBeGreaterThan(0);
      expect(delayMs).toBeLessThanOrEqual(1000);
    } finally {
      checkEm.clear();
    }

    const claimEm = orm.em.fork();

    try {
      const claim = await claimEm.transactional((transactionalEm) =>
        outboxRepository.claimPendingById(event.id, 60, transactionalEm),
      );

      expect(claim).toBeNull();
    } finally {
      claimEm.clear();
    }
  });

  it('should move an event to DEAD_LETTER after five failures', async () => {
    const event = new OutboxEvent();
    event.eventType = 'OutboxDeadLetterTest';
    event.payload = { testId: randomUUID() };

    const writeEm = orm.em.fork();

    try {
      await writeEm.persist(event);
      await writeEm.flush();
    } finally {
      writeEm.clear();
    }

    const failureEm = orm.em.fork();

    try {
      for (let attempt = 1; attempt <= 5; attempt++) {
        const tokenClaimEm = orm.em.fork();
        let leaseToken: string;

        try {
          const claimedEvent = await tokenClaimEm.transactional(
            async (transactionalEm) => {
              await transactionalEm.getConnection().execute(
                `
          UPDATE outbox_events
          SET next_attempt_at = NULL
          WHERE id = ?
          `,
                [event.id],
              );

              return outboxRepository.claimPendingById(
                event.id,
                60,
                transactionalEm,
              );
            },
          );

          if (!claimedEvent?.leaseToken) {
            throw new Error('Could not claim event or retrieve lease token');
          }

          leaseToken = claimedEvent.leaseToken;
        } finally {
          tokenClaimEm.clear();
        }

        const failureEm = orm.em.fork();

        try {
          await failureEm.transactional((transactionalEm) =>
            outboxRepository.markFailed(
              event.id,
              leaseToken,
              `Simulated failure ${attempt}`,
              transactionalEm,
            ),
          );
        } finally {
          failureEm.clear();
        }
      }
    } finally {
      failureEm.clear();
    }

    const checkEm = orm.em.fork();

    try {
      const persistedEvent = await checkEm.findOneOrFail(OutboxEvent, {
        id: event.id,
      });

      expect(persistedEvent.attempts).toBe(5);
      expect(persistedEvent.status).toBe(OutboxEventStatus.DeadLetter);
      expect(persistedEvent.nextAttemptAt).toBeNull();
      expect(persistedEvent.lastError).toBe('Simulated failure 5');
      expect(persistedEvent.leaseUntil).toBeNull();
    } finally {
      checkEm.clear();
    }

    const claimEm = orm.em.fork();

    try {
      const claim = await claimEm.transactional((transactionalEm) =>
        outboxRepository.claimPendingById(event.id, 60, transactionalEm),
      );

      expect(claim).toBeNull();
    } finally {
      claimEm.clear();
    }
  });
});
