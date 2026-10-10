import { Migration } from '@mikro-orm/migrations';

export class Migration20261010204900 extends Migration {

  override name = 'Migration20261010204900';

  override up(): void | Promise<void> {
    this.addSql(`create table "wallets" ("id" uuid not null, "player_id" varchar(255) not null, "currency" varchar(3) not null, "balance" numeric(18,2) not null default '0.00', "version" int not null default 1, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"));`);
    this.addSql(`alter table "wallets" add constraint "wallets_player_currency_unique" unique ("player_id", "currency");`);

    this.addSql(`alter table "wallets" add constraint "wallets_balance_non_negative" check (balance >= 0);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "wallets" cascade;`);
  }

}
