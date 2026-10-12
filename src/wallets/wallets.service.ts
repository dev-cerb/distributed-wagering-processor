import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { Money } from '../shared/domain/money.js';
import { DatabaseTransactionService } from '../shared/infrastructure/database-transaction.service.js';

import {
  WagerTransaction,
  WagerTransactionKind,
} from '../wager-transactions/domain/wager-transaction.js';

import { WalletLedgerEntry } from '../ledger/domain/wallet-ledger-entry.js';
import { LedgerDirection } from '../shared/domain/ledger-direction.js';

import { Wallet } from './domain/wallet.js';
import { WalletRepositoryImpl } from './repositories/wallet.repository-impl.js';
import { WagerTransactionRepositoryImpl } from '../wager-transactions/repositories/wager-transaction.repository-impl.js';
import { WalletLedgerRepositoryImpl } from '../ledger/repositories/wallet-ledger.repository-impl.js';

export interface OpenWalletInput {
  playerId: string;
  initialBalance: {
    amount: string;
    currency: string;
  };
}

@Injectable()
export class WalletsService {
  constructor(
    private readonly walletRepository: WalletRepositoryImpl,
    private readonly wagerTransactionRepository: WagerTransactionRepositoryImpl,
    private readonly walletLedgerRepository: WalletLedgerRepositoryImpl,
    private readonly databaseTransaction: DatabaseTransactionService,
  ) {}

  async open(input: OpenWalletInput) {
    if (typeof input.playerId !== 'string' || !input.playerId.trim()) {
      throw new BadRequestException('Player id is required');
    }

    const playerId = input.playerId.trim();

    let initialBalance: Money;

    try {
      initialBalance = Money.from(input.initialBalance);
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }

      throw new BadRequestException('Invalid initial balance');
    }

    return this.databaseTransaction.execute(async (em) => {
      const existingWallet =
        await this.walletRepository.findByPlayerIdAndCurrency(
          playerId,
          initialBalance.currency,
        );

      if (existingWallet) {
        throw new ConflictException(
          'A wallet already exists for this player and currency',
        );
      }

      const walletId = randomUUID();

      const wallet = Wallet.open({
        id: walletId,
        playerId,
        initialBalance,
      });

      await this.walletRepository.save(wallet, em);

      if (initialBalance.isPositive()) {
        const transactionId = randomUUID();

        const payloadHash = createHash('sha256')
          .update(
            JSON.stringify({
              walletId,
              playerId,
              initialBalance: initialBalance.toJSON(),
            }),
          )
          .digest('hex');

        const openingTransaction = WagerTransaction.create({
          id: transactionId,
          providerId: 'internal',
          externalTransactionId: walletId,
          idempotencyKey: `wallet-opening:${walletId}`,
          payloadHash,
          walletId,
          playerId,
          roundId: 'internal',
          gameId: 'internal',
          kind: WagerTransactionKind.Opening,
          money: initialBalance,
        });

        openingTransaction.markProcessed(undefined, new Date());

        const ledgerEntry = WalletLedgerEntry.create({
          id: randomUUID(),
          walletId,
          transactionId,
          direction: LedgerDirection.Credit,
          money: initialBalance,
          balanceBefore: Money.zero(initialBalance.currency),
          balanceAfter: initialBalance,
        });

        await this.wagerTransactionRepository.save(openingTransaction, em);

        await this.walletLedgerRepository.save(ledgerEntry, em);
      }

      return {
        id: wallet.id,
        playerId: wallet.playerId,
        balance: wallet.balance.toJSON(),
        version: wallet.version,
      };
    });
  }
}
