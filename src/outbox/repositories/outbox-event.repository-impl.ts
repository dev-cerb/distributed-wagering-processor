import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import {
  OutboxEvent,
  OutboxEventStatus,
} from '../entities/outbox-event.entity.js';
import { OutboxEventRepository } from './outbox-event.repository.js';

@Injectable()
export class OutboxEventRepositoryImpl implements OutboxEventRepository {
  async save(event: OutboxEvent, em: EntityManager): Promise<void> {
    em.persist(event);
  }

  async claimPending(
    limit: number,
    leaseDurationSeconds: number,
    em: EntityManager,
  ): Promise<OutboxEvent[]> {
    if (limit <= 0 || leaseDurationSeconds <= 0) {
      return [];
    }

    const rows = await em
      .getConnection()
      .execute<{ id: string; lease_token: string }[]>(
        `
        WITH candidates AS (
          SELECT id
          FROM outbox_events
          WHERE (
            status = ?
            AND (
              next_attempt_at IS NULL
              OR next_attempt_at <= NOW()
            )
          )
          OR (
            status = ?
            AND lease_until <= NOW()
            AND (
              next_attempt_at IS NULL
              OR next_attempt_at <= NOW()
            )
          )
          ORDER BY created_at ASC
          LIMIT ?
          FOR UPDATE SKIP LOCKED
        )
       UPDATE outbox_events AS event
        SET
        status = ?,
        lease_until = NOW() + (? * INTERVAL '1 second'),
        lease_token = gen_random_uuid()
        FROM candidates
        WHERE event.id = candidates.id
        RETURNING event.id, event.lease_token
      `,
        [
          OutboxEventStatus.Pending,
          OutboxEventStatus.Processing,
          limit,
          OutboxEventStatus.Processing,
          leaseDurationSeconds,
        ],
      );

    const ids = rows.map((row) => row.id);

    if (ids.length === 0) {
      return [];
    }

    em.clear();

    return em.find(
      OutboxEvent,
      { id: { $in: ids } },
      { orderBy: { createdAt: 'ASC' } },
    );
  }

  async claimPendingById(
    eventId: string,
    leaseDurationSeconds: number,
    em: EntityManager,
  ): Promise<OutboxEvent | null> {
    if (leaseDurationSeconds <= 0) {
      return null;
    }
    const leaseToken = randomUUID();

    const rows = await em
      .getConnection()
      .execute<{ id: string; lease_token: string }[]>(
        `
    UPDATE outbox_events
    SET
      status = ?,
      lease_until = NOW() + (? * INTERVAL '1 second'),
      lease_token = ?
    WHERE id = ?
      AND (
        (
          status = ?
          AND (
            next_attempt_at IS NULL
            OR next_attempt_at <= NOW()
          )
        )
        OR (
          status = ?
          AND lease_until <= NOW()
          AND (
            next_attempt_at IS NULL
            OR next_attempt_at <= NOW()
          )
        )
      )
    RETURNING id, lease_token
  `,
        [
          OutboxEventStatus.Processing,
          leaseDurationSeconds,
          leaseToken,
          eventId,
          OutboxEventStatus.Pending,
          OutboxEventStatus.Processing,
        ],
      );

    if (rows.length === 0) {
      return null;
    }

    em.clear();

    return em.findOne(OutboxEvent, {
      id: rows[0].id,
      status: OutboxEventStatus.Processing,
      leaseToken: rows[0].lease_token,
    });
  }

  async markPublished(
    eventId: string,
    leaseToken: string,
    em: EntityManager,
  ): Promise<void> {
    const rows = await em.getConnection().execute<{ id: string }[]>(
      `
      UPDATE outbox_events
      SET
        status = ?,
        published_at = NOW(),
        lease_until = NULL,
        lease_token = NULL,
        next_attempt_at = NULL,
        last_error = NULL
      WHERE id = ?
        AND status = ?
        AND lease_token = ?
        AND lease_until > NOW()
      RETURNING id
    `,
      [
        OutboxEventStatus.Published,
        eventId,
        OutboxEventStatus.Processing,
        leaseToken,
      ],
    );

    if (rows.length !== 1) {
      throw new Error(
        `Cannot mark outbox event as published: lease is no longer valid (${eventId})`,
      );
    }
  }

  async markFailed(
    eventId: string,
    leaseToken: string,
    error: string,
    em: EntityManager,
  ): Promise<void> {
    const rows = await em.getConnection().execute<{ id: string }[]>(
      `
      UPDATE outbox_events
      SET
        attempts = attempts + 1,
        last_error = ?,
        lease_until = NULL,
        lease_token = NULL,
        status = CASE
          WHEN attempts + 1 >= 5 THEN ?
          ELSE ?
        END,
        next_attempt_at = CASE
          WHEN attempts + 1 >= 5 THEN NULL
          ELSE NOW() + (
            LEAST(
              POWER(2, attempts),
              60
            ) * INTERVAL '1 second'
          )
        END
      WHERE id = ?
        AND status = ?
        AND lease_token = ?
        AND lease_until > NOW()
      RETURNING id
    `,
      [
        error,
        OutboxEventStatus.DeadLetter,
        OutboxEventStatus.Pending,
        eventId,
        OutboxEventStatus.Processing,
        leaseToken,
      ],
    );

    if (rows.length !== 1) {
      throw new Error(
        `Cannot mark outbox event as failed: lease is no longer valid (${eventId})`,
      );
    }
  }
}
