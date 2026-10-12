import { randomUUID } from 'node:crypto';
import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'inbox_messages' })
@Unique({
  name: 'inbox_messages_consumer_message_unique',
  properties: ['consumer', 'messageId'],
})
export class InboxMessage {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property({ type: 'varchar', length: 100 })
  consumer!: string;

  @Property({ type: 'varchar', length: 255 })
  messageId!: string;

  @Property({ type: 'Date', defaultRaw: 'now()' })
  processedAt: Date = new Date();
}
