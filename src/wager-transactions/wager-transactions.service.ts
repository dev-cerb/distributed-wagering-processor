import { Injectable, NotFoundException } from '@nestjs/common';

import { WagerTransaction } from './domain/wager-transaction.js';
import { WagerTransactionRepositoryImpl } from './repositories/wager-transaction.repository-impl.js';

@Injectable()
export class WagerTransactionsService {
  constructor(
    private readonly wagerTransactionRepository: WagerTransactionRepositoryImpl,
  ) {}

  async getById(transactionId: string) {
    const transaction =
      await this.wagerTransactionRepository.findByIdForRead(transactionId);

    if (!transaction) {
      throw new NotFoundException('Wager transaction not found');
    }

    return this.toResponse(transaction);
  }

  async getByExternalId(providerId: string, externalTransactionId: string) {
    const transaction =
      await this.wagerTransactionRepository.findByProviderAndExternalTransactionIdForRead(
        providerId,
        externalTransactionId,
      );

    if (!transaction) {
      throw new NotFoundException('Wager transaction not found');
    }

    return this.toResponse(transaction);
  }

  private toResponse(transaction: WagerTransaction) {
    return {
      id: transaction.id,
      providerId: transaction.providerId,
      externalTransactionId: transaction.externalTransactionId,
      walletId: transaction.walletId,
      playerId: transaction.playerId,
      roundId: transaction.roundId,
      gameId: transaction.gameId,
      kind: transaction.kind,
      money: transaction.money.toJSON(),
      status: transaction.status,
      referenceExternalTransactionId:
        transaction.referenceExternalTransactionId ?? null,
      referenceTransactionId: transaction.referenceTransactionId ?? null,
      failureCode: transaction.failureCode ?? null,
      processedAt: transaction.processedAt ?? null,
      resultBalance: transaction.resultBalance?.toJSON() ?? null,
      resultWalletVersion: transaction.resultWalletVersion ?? null,
      createdAt: transaction.createdAt,
    };
  }
}
