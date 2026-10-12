import { Controller, Get } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { ConfigService } from '@nestjs/config';
import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';

@Controller('health')
export class HealthController {
  private readonly sqs: SQSClient;
  private readonly queueUrl: string;

  constructor(
    private readonly em: EntityManager,
    private readonly configService: ConfigService,
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

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const checks = {
      postgres: false,
      sqs: false,
    };

    try {
      await this.em.getConnection().execute('SELECT 1');
      checks.postgres = true;
    } catch {
      // PostgreSQL indisponível.
    }

    try {
      await this.sqs.send(
        new GetQueueAttributesCommand({
          QueueUrl: this.queueUrl,
          AttributeNames: ['QueueArn'],
        }),
      );
      checks.sqs = true;
    } catch {
      // SQS indisponível.
    }

    const ready = checks.postgres && checks.sqs;

    return {
      status: ready ? 'ok' : 'error',
      checks,
    };
  }
}
