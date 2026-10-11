import { EntityManager } from '@mikro-orm/postgresql';

import { WalletLedgerEntry } from '../domain/wallet-ledger-entry.js';

export interface WalletLedgerRepository {
  findById(id: string): Promise<WalletLedgerEntry | null>;

  findByTransactionId(transactionId: string): Promise<WalletLedgerEntry[]>;

  save(entry: WalletLedgerEntry, em: EntityManager): Promise<void>;
}
