import { Migration } from '@mikro-orm/migrations';

export class Migration20261012065909 extends Migration {

  override name = 'Migration20261012065909';

  override up(): void | Promise<void> {
    this.addSql(`alter table "outbox_events" drop constraint "outbox_events_status_check";`);
    this.addSql(`alter table "outbox_events" add constraint "outbox_events_status_check" check ("status" in ('PENDING', 'PROCESSING', 'PUBLISHED', 'DEAD_LETTER'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "outbox_events" drop constraint "outbox_events_status_check";`);
    this.addSql(`alter table "outbox_events" add constraint "outbox_events_status_check" check ("status" in ('PENDING', 'PROCESSING', 'PUBLISHED'));`);
  }

}
