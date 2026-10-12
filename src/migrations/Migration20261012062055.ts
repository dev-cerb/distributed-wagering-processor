import { Migration } from '@mikro-orm/migrations';

export class Migration20261012062055 extends Migration {

  override name = 'Migration20261012062055';

  override up(): void | Promise<void> {
    this.addSql(`alter table "outbox_events" drop constraint "outbox_events_status_check";`);
    this.addSql(`alter table "outbox_events" add constraint "outbox_events_status_check" check ("status" in ('PENDING', 'PROCESSING', 'PUBLISHED'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "outbox_events" drop constraint "outbox_events_status_check";`);
    this.addSql(`alter table "outbox_events" add constraint "outbox_events_status_check" check ("status" in ('PENDING', 'PUBLISHED'));`);
  }

}
