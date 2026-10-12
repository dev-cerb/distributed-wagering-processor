import { Migration } from '@mikro-orm/migrations';

export class Migration20261012062648 extends Migration {

  override name = 'Migration20261012062648';

  override up(): void | Promise<void> {
    this.addSql(`alter table "outbox_events" add "lease_until" timestamptz null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "outbox_events" drop column "lease_until";`);
  }

}
