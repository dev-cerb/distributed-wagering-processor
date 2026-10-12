import { Migration } from '@mikro-orm/migrations';

export class Migration20261012070902 extends Migration {

  override name = 'Migration20261012070902';

  override up(): void | Promise<void> {
    this.addSql(`alter table "outbox_events" add "lease_token" uuid null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "outbox_events" drop column "lease_token";`);
  }

}
