import { EntityManager } from '@mikro-orm/postgresql';

import { WagerTransaction } from '../domain/wager-transaction.js';

export interface WagerTransactionRepository {
  findByIdForRead(id: string): Promise<WagerTransaction | null>;

  findById(id: string, em: EntityManager): Promise<WagerTransaction | null>;

  findByProviderAndExternalTransactionIdForRead(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null>;

  findByProviderAndExternalTransactionId(
    providerId: string,
    externalTransactionId: string,
    em: EntityManager,
  ): Promise<WagerTransaction | null>;

  findByProviderAndIdempotencyKey(
    providerId: string,
    idempotencyKey: string,
    em: EntityManager,
  ): Promise<WagerTransaction | null>;

  findByReferenceTransactionId(
    referenceTransactionId: string,
    em: EntityManager,
  ): Promise<WagerTransaction[]>;

  findByIdForUpdate(
    id: string,
    em: EntityManager,
  ): Promise<WagerTransaction | null>;

  save(transaction: WagerTransaction, em: EntityManager): Promise<void>;
}
