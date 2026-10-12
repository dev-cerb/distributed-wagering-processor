import { Migration } from '@mikro-orm/migrations';

export class Migration20261012041218 extends Migration {

  override name = 'Migration20261012041218';

  override up(): void | Promise<void> {
    this.addSql(`create table "outbox_events" ("id" uuid not null, "event_type" varchar(100) not null, "payload" jsonb not null, "status" text not null default 'PENDING', "attempts" int not null default 0, "last_error" text null, "created_at" timestamptz not null, "published_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "outbox_events_status_created_at_index" on "outbox_events" ("status", "created_at");`);

    this.addSql(`alter table "outbox_events" add constraint "outbox_events_status_check" check ("status" in ('PENDING', 'PUBLISHED'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "outbox_events" cascade;`);
  }

}
