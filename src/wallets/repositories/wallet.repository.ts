import { EntityManager } from '@mikro-orm/postgresql';

import { Wallet } from '../domain/wallet.js';

export interface WalletRepository {
  findByPlayerIdAndCurrency(
    playerId: string,
    currency: string,
  ): Promise<Wallet | null>;

  findById(id: string): Promise<Wallet | null>;

  save(wallet: Wallet, em: EntityManager): Promise<void>;
}
