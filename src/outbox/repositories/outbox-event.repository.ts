import { EntityManager } from '@mikro-orm/postgresql';
import { OutboxEvent } from '../entities/outbox-event.entity.js';

export interface OutboxEventRepository {
  save(event: OutboxEvent, em: EntityManager): Promise<void>;

  claimPending(
    limit: number,
    leaseDurationSeconds: number,
    em: EntityManager,
  ): Promise<OutboxEvent[]>;

  claimPendingById(
    eventId: string,
    leaseDurationSeconds: number,
    em: EntityManager,
  ): Promise<OutboxEvent | null>;

  markPublished(
    eventId: string,
    leaseToken: string,
    em: EntityManager,
  ): Promise<void>;

  markFailed(
    eventId: string,
    leaseToken: string,
    error: string,
    em: EntityManager,
  ): Promise<void>;
}
