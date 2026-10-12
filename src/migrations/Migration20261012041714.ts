import { Migration } from '@mikro-orm/migrations';

export class Migration20261012041714 extends Migration {

  override name = 'Migration20261012041714';

  override up(): void | Promise<void> {
    this.addSql(`alter table "outbox_events" alter column "created_at" set default now();`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "outbox_events" alter column "created_at" drop default;`);
  }

}
