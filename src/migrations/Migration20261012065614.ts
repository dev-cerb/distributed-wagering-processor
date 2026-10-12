import { Migration } from '@mikro-orm/migrations';

export class Migration20261012065614 extends Migration {

  override name = 'Migration20261012065614';

  override up(): void | Promise<void> {
    this.addSql(`alter table "outbox_events" add "next_attempt_at" timestamptz null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "outbox_events" drop column "next_attempt_at";`);
  }

}
