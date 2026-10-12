import { randomUUID } from 'node:crypto';
import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Unique,
  Index,
  Check,
} from '@mikro-orm/decorators/legacy';

import { WalletEntity } from '../../wallets/entities/wallet.entity.js';

import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../domain/wager-transaction.js';

@Entity({ tableName: 'wager_transactions' })
@Unique({
  name: 'wager_transactions_provider_external_unique',
  properties: ['providerId', 'externalTransactionId'],
})
@Unique({
  name: 'wager_transactions_provider_idempotency_unique',
  properties: ['providerId', 'idempotencyKey'],
})
@Index({
  name: 'wager_transactions_wallet_id_idx',
  properties: ['wallet'],
})
@Index({
  name: 'wager_transactions_reference_transaction_id_idx',
  properties: ['referenceTransaction'],
})
@Index({
  name: 'wager_transactions_status_created_at_idx',
  properties: ['status', 'createdAt'],
})
@Check({
  name: 'wager_transactions_kind_check',
  expression: `"kind" in ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK')`,
})
@Check({
  name: 'wager_transactions_status_check',
  expression: `"status" in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED')`,
})
export class WagerTransactionEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property({ type: 'string', length: 255 })
  providerId!: string;

  @Property({ type: 'string', length: 255 })
  externalTransactionId!: string;

  @Property({ type: 'string', length: 255 })
  idempotencyKey!: string;

  @Property({ type: 'string', length: 64 })
  payloadHash!: string;

  @ManyToOne(() => WalletEntity, {
    fieldName: 'wallet_id',
    deleteRule: 'restrict',
  })
  wallet!: WalletEntity;

  @Property({ type: 'string', length: 255 })
  playerId!: string;

  @Property({ type: 'string', length: 255 })
  roundId!: string;

  @Property({ type: 'string', length: 255 })
  gameId!: string;

  @Property({ type: 'string', length: 20 })
  kind!: WagerTransactionKind;

  @Property({ type: 'string', columnType: 'numeric(18,2)' })
  amount!: string;

  @Property({ type: 'string', length: 3 })
  currency!: string;

  @Property({ type: 'string', length: 255, nullable: true })
  referenceExternalTransactionId?: string;

  @ManyToOne(() => WagerTransactionEntity, {
    fieldName: 'reference_transaction_id',
    nullable: true,
    deleteRule: 'restrict',
  })
  referenceTransaction?: WagerTransactionEntity;

  @Property({ type: 'Date' })
  createdAt: Date = new Date();

  @Property({ type: 'string', length: 30 })
  status!: WagerTransactionStatus;

  @Property({ type: 'string', length: 100, nullable: true })
  failureCode?: string;

  @Property({ type: 'Date', nullable: true })
  processedAt?: Date;

  @Property({ type: 'string', columnType: 'numeric(18,2)', nullable: true })
  resultBalance?: string;

  @Property({ type: 'integer', nullable: true })
  resultWalletVersion?: number;
}
