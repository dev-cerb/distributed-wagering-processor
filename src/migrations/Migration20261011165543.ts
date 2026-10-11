import { Migration } from '@mikro-orm/migrations';

export class Migration20261011165543 extends Migration {

  override name = 'Migration20261011165543';

  override up(): void | Promise<void> {
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_status_check" check ("status" in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_kind_check" check ("kind" in ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "wager_transactions" drop constraint "wager_transactions_status_check";`);
    this.addSql(`alter table "wager_transactions" drop constraint "wager_transactions_kind_check";`);
  }

}
