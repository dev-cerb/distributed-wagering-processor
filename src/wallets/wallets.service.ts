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

function encodeCursor(cursor: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
  ).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { createdAt?: unknown; id?: unknown };

    if (
      typeof decoded.createdAt !== 'string' ||
      typeof decoded.id !== 'string' ||
      !decoded.id.trim()
    ) {
      throw new Error('Invalid cursor');
    }

    const createdAt = new Date(decoded.createdAt);

    if (
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== decoded.createdAt
    ) {
      throw new Error('Invalid cursor');
    }

    return { createdAt, id: decoded.id };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
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

  async getWallet(walletId: string) {
    const wallet = await this.walletRepository.findById(walletId);

    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    return {
      id: wallet.id,
      playerId: wallet.playerId,
      currency: wallet.currency,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }

  async reconcileWallet(walletId: string) {
    const wallet = await this.walletRepository.findById(walletId);

    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    const reconciliation =
      await this.walletLedgerRepository.reconcileWalletBalance(walletId);

    const storedAmount = wallet.balance.toString();
    const calculatedAmount = reconciliation.reconstructedBalance;

    // Valores monetários em centavos para evitar
    // imprecisões de ponto flutuante.
    const storedCents = Math.round(Number(storedAmount) * 100);
    const calculatedCents = Math.round(Number(calculatedAmount) * 100);

    const differenceCents = storedCents - calculatedCents;

    const formatAmount = (cents: number) => (cents / 100).toFixed(2);

    return {
      walletId: wallet.id,
      storedBalance: {
        amount: storedAmount,
        currency: wallet.currency,
      },
      calculatedBalance: {
        amount: calculatedAmount,
        currency: wallet.currency,
      },
      difference: {
        amount: formatAmount(differenceCents),
        currency: wallet.currency,
      },
      consistent: differenceCents === 0,
      checkedEntries: reconciliation.entryCount,
    };
  }

  async getLedger(walletId: string, limit = 50, cursor?: string) {
    const wallet = await this.walletRepository.findById(walletId);

    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException(
        'Limit must be an integer between 1 and 100',
      );
    }

    const decodedCursor = cursor ? decodeCursor(cursor) : undefined;

    const entries = await this.walletLedgerRepository.findByWalletId(
      walletId,
      limit + 1,
      decodedCursor,
    );

    const hasMore = entries.length > limit;
    const items = hasMore ? entries.slice(0, limit) : entries;
    const lastItem = items[items.length - 1];

    return {
      items: items.map((entry) => ({
        id: entry.id,
        transactionId: entry.transactionId,
        direction: entry.direction,
        amount: entry.money.toJSON(),
        balanceBefore: entry.balanceBefore.toJSON(),
        balanceAfter: entry.balanceAfter.toJSON(),
        createdAt: entry.createdAt,
      })),
      nextCursor:
        hasMore && lastItem
          ? encodeCursor({
              createdAt: lastItem.createdAt,
              id: lastItem.id,
            })
          : null,
    };
  }
}
