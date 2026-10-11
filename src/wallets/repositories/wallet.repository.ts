import { Wallet } from '../domain/wallet.js';

export interface WalletRepository {
  findByPlayerIdAndCurrency(
    playerId: string,
    currency: string,
  ): Promise<Wallet | null>;

  findById(id: string): Promise<Wallet | null>;

  save(wallet: Wallet): Promise<void>;
}
