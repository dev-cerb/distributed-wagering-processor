import { Migration } from '@mikro-orm/migrations';

export class Migration20261012074329 extends Migration {

  override name = 'Migration20261012074329';

  override up(): void | Promise<void> {
    this.addSql(`create table "inbox_messages" ("id" uuid not null, "consumer" varchar(100) not null, "message_id" varchar(255) not null, "processed_at" timestamptz not null default now(), primary key ("id"));`);
    this.addSql(`alter table "inbox_messages" add constraint "inbox_messages_consumer_message_unique" unique ("consumer", "message_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "inbox_messages" cascade;`);
  }

}
