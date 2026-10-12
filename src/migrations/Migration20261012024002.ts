import { Migration } from '@mikro-orm/migrations';

export class Migration20261012024002 extends Migration {

  override name = 'Migration20261012024002';

  override up(): void | Promise<void> {
    this.addSql(`alter table "wager_transactions" add "result_balance" numeric(18,2) null, add "result_wallet_version" int null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "wager_transactions" drop column "result_balance", drop column "result_wallet_version";`);
  }

}
