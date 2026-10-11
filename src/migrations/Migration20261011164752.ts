import { Migration } from '@mikro-orm/migrations';

export class Migration20261011164752 extends Migration {
  override name = 'Migration20261011164752';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "wager_transactions" ("id" uuid not null, "provider_id" varchar(255) not null, "external_transaction_id" varchar(255) not null, "idempotency_key" varchar(255) not null, "payload_hash" varchar(64) not null, "wallet_id" uuid not null, "player_id" varchar(255) not null, "round_id" varchar(255) not null, "game_id" varchar(255) not null, "kind" varchar(20) not null, "amount" numeric(18,2) not null, "currency" varchar(3) not null, "reference_external_transaction_id" varchar(255) null, "reference_transaction_id" uuid null, "created_at" timestamptz not null, "status" varchar(30) not null, "failure_code" varchar(100) null, "processed_at" timestamptz null, primary key ("id"));`,
    );
    this.addSql(
      `create index "wager_transactions_status_created_at_idx" on "wager_transactions" ("status", "created_at");`,
    );
    this.addSql(
      `create index "wager_transactions_reference_transaction_id_idx" on "wager_transactions" ("reference_transaction_id");`,
    );
    this.addSql(
      `create index "wager_transactions_wallet_id_idx" on "wager_transactions" ("wallet_id");`,
    );
    this.addSql(
      `alter table "wager_transactions" add constraint "wager_transactions_provider_idempotency_unique" unique ("provider_id", "idempotency_key");`,
    );
    this.addSql(
      `alter table "wager_transactions" add constraint "wager_transactions_provider_external_unique" unique ("provider_id", "external_transaction_id");`,
    );

    this.addSql(
      `alter table "wager_transactions" add constraint "wager_transactions_wallet_id_foreign" foreign key ("wallet_id") references "wallets" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "wager_transactions" add constraint "wager_transactions_reference_transaction_id_foreign" foreign key ("reference_transaction_id") references "wager_transactions" ("id") on delete restrict;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "wager_transactions" drop constraint "wager_transactions_reference_transaction_id_foreign";`,
    );

    this.addSql(`drop table if exists "wager_transactions" cascade;`);
  }
}
