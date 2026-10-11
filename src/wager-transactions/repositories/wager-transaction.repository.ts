import { WagerTransaction } from '../domain/wager-transaction.js';

export interface WagerTransactionRepository {
  findById(id: string): Promise<WagerTransaction | null>;

  findByProviderAndExternalTransactionId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null>;

  findByProviderAndIdempotencyKey(
    providerId: string,
    idempotencyKey: string,
  ): Promise<WagerTransaction | null>;

  save(transaction: WagerTransaction): Promise<void>;
}
