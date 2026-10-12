import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { Cron, CronExpression } from '@nestjs/schedule';

import { InboxMessageRepository } from './repositories/inbox-message.repository.js';
import { DatabaseTransactionService } from '../shared/infrastructure/database-transaction.service.js';
import { ProcessWagerTransactionUseCase } from '../wager-transactions/use-cases/process-wager-transaction.use-case.js';

const CONSUMER_NAME = 'wager-transaction-requests';

@Injectable()
export class InboxConsumerService {
  private readonly logger = new Logger(InboxConsumerService.name);
  private readonly sqs: SQSClient;
  private readonly queueUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly inboxRepository: InboxMessageRepository,
    private readonly databaseTransactionService: DatabaseTransactionService,
    private readonly processWagerTransaction: ProcessWagerTransactionUseCase,
  ) {
    this.queueUrl = this.configService.getOrThrow<string>(
      'SQS_WAGER_TRANSACTION_REQUESTS_QUEUE_URL',
    );

    this.sqs = new SQSClient({
      region: this.configService.get<string>('AWS_REGION') ?? 'us-east-1',
      endpoint: this.configService.get<string>('AWS_ENDPOINT_URL'),
      credentials: {
        accessKeyId:
          this.configService.get<string>('AWS_ACCESS_KEY_ID') ?? 'test',
        secretAccessKey:
          this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ?? 'test',
      },
    });
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async pollQueue(): Promise<void> {
    try {
      const response = await this.sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 5,
          WaitTimeSeconds: 1,
          VisibilityTimeout: 30,
        }),
      );

      for (const message of response.Messages ?? []) {
        if (!message.Body || !message.ReceiptHandle || !message.MessageId) {
          this.logger.warn('Mensagem SQS sem campos obrigatórios.');
          continue;
        }

        try {
          const alreadyProcessed =
            await this.databaseTransactionService.execute((em) =>
              this.inboxRepository.hasBeenProcessed(
                CONSUMER_NAME,
                message.MessageId!,
                em,
              ),
            );

          if (!alreadyProcessed) {
            const payload = JSON.parse(message.Body);
            const data = payload.data ?? payload;

            await this.processWagerTransaction.execute({
              providerId: data.providerId,
              externalTransactionId: data.externalTransactionId,
              idempotencyKey: data.idempotencyKey,
              walletId: data.walletId,
              playerId: data.playerId,
              roundId: data.roundId,
              gameId: data.gameId,
              kind: data.kind,
              amount: data.money.amount,
              currency: data.money.currency,
              referenceExternalTransactionId:
                data.referenceExternalTransactionId,
            });

            await this.databaseTransactionService.execute((em) =>
              this.inboxRepository.save(CONSUMER_NAME, message.MessageId!, em),
            );
          }

          await this.sqs.send(
            new DeleteMessageCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
        } catch (error) {
          this.logger.error(
            `Falha ao processar mensagem ${message.MessageId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Falha ao consultar fila SQS: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
