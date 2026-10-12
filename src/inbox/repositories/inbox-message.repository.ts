import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

import { InboxMessage } from '../entities/inbox-message.entity.js';

@Injectable()
export class InboxMessageRepository {
  async hasBeenProcessed(
    consumer: string,
    messageId: string,
    em: EntityManager,
  ): Promise<boolean> {
    const existing = await em.findOne(InboxMessage, {
      consumer,
      messageId,
    });

    return existing !== null;
  }

  async save(
    consumer: string,
    messageId: string,
    em: EntityManager,
  ): Promise<void> {
    const message = new InboxMessage();
    message.consumer = consumer;
    message.messageId = messageId;

    em.persist(message);
    await em.flush();
  }
}
