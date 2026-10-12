import {
  Entity,
  Enum,
  Index,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';
import { randomUUID } from 'node:crypto';

export enum OutboxEventStatus {
  Pending = 'PENDING',
  Processing = 'PROCESSING',
  Published = 'PUBLISHED',
  DeadLetter = 'DEAD_LETTER',
}

@Entity({ tableName: 'outbox_events' })
@Index({ properties: ['status', 'createdAt'] })
export class OutboxEvent {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property({ type: 'varchar', length: 100 })
  eventType!: string;

  @Property({ type: 'json' })
  payload!: Record<string, unknown>;

  @Enum({
    items: () => OutboxEventStatus,
    type: 'string',
  })
  status: OutboxEventStatus = OutboxEventStatus.Pending;

  @Property({ type: 'integer', default: 0 })
  attempts = 0;

  @Property({ type: 'text', nullable: true })
  lastError: string | null = null;

  @Property({ type: 'Date', defaultRaw: 'now()' })
  createdAt = new Date();

  @Property({ type: 'Date', nullable: true })
  publishedAt: Date | null = null;

  @Property({ type: 'Date', nullable: true })
  leaseUntil: Date | null = null;

  @Property({ type: 'uuid', nullable: true })
  leaseToken: string | null = null;

  @Property({ type: 'Date', nullable: true })
  nextAttemptAt: Date | null = null;
}
