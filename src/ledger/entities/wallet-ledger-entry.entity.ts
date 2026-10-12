import { randomUUID } from 'node:crypto';

import {
  Check,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import { LedgerDirection } from '../../shared/domain/ledger-direction.js';
import { WalletEntity } from '../../wallets/entities/wallet.entity.js';
import { WagerTransactionEntity } from '../../wager-transactions/entities/wager-transaction.entity.js';

@Entity({ tableName: 'wallet_ledger_entries' })
@Unique({
  name: 'wallet_ledger_transaction_wallet_unique',
  properties: ['transaction', 'wallet'],
})
@Index({
  name: 'wallet_ledger_wallet_created_at_idx',
  properties: ['wallet', 'createdAt'],
})
@Index({
  name: 'wallet_ledger_transaction_id_idx',
  properties: ['transaction'],
})
@Check({
  name: 'wallet_ledger_direction_check',
  expression: `"direction" in ('DEBIT', 'CREDIT')`,
})
export class WalletLedgerEntryEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => WalletEntity, {
    fieldName: 'wallet_id',
    deleteRule: 'restrict',
  })
  wallet!: WalletEntity;

  @ManyToOne(() => WagerTransactionEntity, {
    fieldName: 'transaction_id',
    deleteRule: 'restrict',
  })
  transaction!: WagerTransactionEntity;

  @Property({ type: 'string', length: 10 })
  direction!: LedgerDirection;

  @Property({ type: 'string', columnType: 'numeric(18,2)' })
  amount!: string;

  @Property({ type: 'string', length: 3 })
  currency!: string;

  @Property({ type: 'string', columnType: 'numeric(18,2)' })
  balanceBefore!: string;

  @Property({ type: 'string', columnType: 'numeric(18,2)' })
  balanceAfter!: string;

  @Property({ type: 'Date' })
  createdAt: Date = new Date();
}
