import { EntityManager } from '@mikro-orm/postgresql';

import { WalletLedgerEntry } from '../domain/wallet-ledger-entry.js';

export interface WalletLedgerRepository {
  findById(id: string): Promise<WalletLedgerEntry | null>;

  findByTransactionId(transactionId: string): Promise<WalletLedgerEntry[]>;

  findByWalletId(
    walletId: string,
    limit: number,
    cursor?: {
      createdAt: Date;
      id: string;
    },
  ): Promise<WalletLedgerEntry[]>;

  reconcileWalletBalance(walletId: string): Promise<{
    entryCount: number;
    reconstructedBalance: string;
  }>;

  save(entry: WalletLedgerEntry, em: EntityManager): Promise<void>;
}
