import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { Money } from '../../shared/domain/money.js';
import { LedgerDirection } from '../../shared/domain/ledger-direction.js';
import { DatabaseTransactionService } from '../../shared/infrastructure/database-transaction.service.js';

import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../domain/wager-transaction.js';

import { WalletRepositoryImpl } from '../../wallets/repositories/wallet.repository-impl.js';
import { WagerTransactionRepositoryImpl } from '../repositories/wager-transaction.repository-impl.js';
import { WalletLedgerRepositoryImpl } from '../../ledger/repositories/wallet-ledger.repository-impl.js';
import { WalletLedgerEntry } from '../../ledger/domain/wallet-ledger-entry.js';

export interface ProcessWagerTransactionInput {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  amount: string;
  currency: string;
  kind?: WagerTransactionKind;
  referenceExternalTransactionId?: string;
}

const INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS';
const INVALID_REFERENCE = 'INVALID_REFERENCE';
const REFERENCE_ALREADY_REVERSED = 'REFERENCE_ALREADY_REVERSED';

@Injectable()
export class ProcessWagerTransactionUseCase {
  constructor(
    private readonly walletRepository: WalletRepositoryImpl,
    private readonly wagerTransactionRepository: WagerTransactionRepositoryImpl,
    private readonly walletLedgerRepository: WalletLedgerRepositoryImpl,
    private readonly databaseTransaction: DatabaseTransactionService,
  ) {}

  async execute(input: ProcessWagerTransactionInput) {
    const requiredFields = [
      input.providerId,
      input.externalTransactionId,
      input.idempotencyKey,
      input.walletId,
      input.playerId,
      input.roundId,
      input.gameId,
      input.currency,
    ];

    if (
      requiredFields.some((value) => typeof value !== 'string' || !value.trim())
    ) {
      throw new BadRequestException('Required fields are missing');
    }

    const kind = input.kind ?? WagerTransactionKind.Bet;

    if (
      !Object.values(WagerTransactionKind).includes(kind) ||
      kind === WagerTransactionKind.Opening
    ) {
      throw new BadRequestException('Invalid external transaction kind');
    }

    const requiresReference =
      kind === WagerTransactionKind.Refund ||
      kind === WagerTransactionKind.Rollback;

    if (
      requiresReference &&
      (typeof input.referenceExternalTransactionId !== 'string' ||
        !input.referenceExternalTransactionId.trim())
    ) {
      throw new BadRequestException(`${kind} requires a reference transaction`);
    }

    if (input.referenceExternalTransactionId === input.externalTransactionId) {
      throw new BadRequestException('A transaction cannot reference itself');
    }

    let money: Money;

    try {
      money = Money.from({
        amount: input.amount,
        currency: input.currency,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Invalid monetary amount or currency',
      );
    }

    if (!money.isPositive()) {
      throw new BadRequestException('Transaction amount must be positive');
    }

    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          providerId: input.providerId,
          externalTransactionId: input.externalTransactionId,
          walletId: input.walletId,
          playerId: input.playerId,
          roundId: input.roundId,
          gameId: input.gameId,
          kind,
          amount: money.toString(),
          currency: money.currency,
          referenceExternalTransactionId:
            input.referenceExternalTransactionId ?? null,
        }),
      )
      .digest('hex');

    return this.databaseTransaction.execute(async (em) => {
      const existingByKey =
        await this.wagerTransactionRepository.findByProviderAndIdempotencyKey(
          input.providerId,
          input.idempotencyKey,
        );

      const existingByExternalId =
        await this.wagerTransactionRepository.findByProviderAndExternalTransactionId(
          input.providerId,
          input.externalTransactionId,
        );

      if (
        existingByKey &&
        existingByExternalId &&
        existingByKey.id !== existingByExternalId.id
      ) {
        throw new ConflictException(
          'Idempotency key and external transaction ID identify different transactions',
        );
      }

      const existing = existingByKey ?? existingByExternalId;

      if (existing) {
        if (!existing.matchesPayload(payloadHash)) {
          throw new ConflictException(
            'Transaction identifier was reused with a different payload',
          );
        }

        return {
          transactionId: existing.id,
          status: existing.status,
          failureCode: existing.failureCode,
          balance: existing.resultBalance?.toJSON(),
          version: existing.resultWalletVersion,
          idempotentReplay: true,
        };
      }

      const wallet = await this.walletRepository.findByIdForUpdate(
        input.walletId,
        em,
      );

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (
        wallet.playerId !== input.playerId ||
        wallet.balance.currency !== money.currency
      ) {
        throw new BadRequestException(
          'Wallet does not match player or currency',
        );
      }

      const transaction = WagerTransaction.create({
        id: randomUUID(),
        providerId: input.providerId,
        externalTransactionId: input.externalTransactionId,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
        walletId: wallet.id,
        playerId: input.playerId,
        roundId: input.roundId,
        gameId: input.gameId,
        kind,
        money,
        referenceExternalTransactionId: input.referenceExternalTransactionId,
      });

      let reference: WagerTransaction | undefined;

      if (requiresReference) {
        reference =
          (await this.wagerTransactionRepository.findByProviderAndExternalTransactionId(
            input.providerId,
            input.referenceExternalTransactionId!,
          )) ?? undefined;

        if (reference) {
          reference =
            (await this.wagerTransactionRepository.findByIdForUpdate(
              reference.id,
              em,
            )) ?? undefined;
        }

        if (!reference) {
          transaction.markPendingReference();
          await this.wagerTransactionRepository.save(transaction, em);

          return {
            transactionId: transaction.id,
            status: transaction.status,
            idempotentReplay: false,
          };
        }

        const referenceIsValid =
          reference.status === WagerTransactionStatus.Processed &&
          reference.providerId === transaction.providerId &&
          reference.playerId === transaction.playerId &&
          reference.walletId === transaction.walletId &&
          reference.roundId === transaction.roundId &&
          reference.gameId === transaction.gameId &&
          reference.money.currency === transaction.money.currency &&
          reference.money.toString() === transaction.money.toString() &&
          (kind !== WagerTransactionKind.Refund ||
            reference.kind === WagerTransactionKind.Bet) &&
          (kind !== WagerTransactionKind.Rollback ||
            [
              WagerTransactionKind.Bet,
              WagerTransactionKind.Win,
              WagerTransactionKind.Refund,
            ].includes(reference.kind));

        if (!referenceIsValid) {
          transaction.reject(INVALID_REFERENCE);
          await this.wagerTransactionRepository.save(transaction, em);

          return {
            transactionId: transaction.id,
            status: transaction.status,
            failureCode: transaction.failureCode,
            idempotentReplay: false,
          };
        }

        const reversals =
          await this.wagerTransactionRepository.findByReferenceTransactionId(
            reference.id,
            em,
          );

        const alreadyReversed = reversals.some(
          (item) =>
            item.status === WagerTransactionStatus.Processed &&
            (item.kind === WagerTransactionKind.Refund ||
              item.kind === WagerTransactionKind.Rollback),
        );

        if (alreadyReversed) {
          transaction.reject(REFERENCE_ALREADY_REVERSED);
          await this.wagerTransactionRepository.save(transaction, em);

          return {
            transactionId: transaction.id,
            status: transaction.status,
            failureCode: transaction.failureCode,
            idempotentReplay: false,
          };
        }
      }

      if (kind === WagerTransactionKind.Loss) {
        transaction.markProcessed(undefined, new Date());
        transaction.recordResult(wallet.balance, wallet.version);

        await this.wagerTransactionRepository.save(transaction, em);

        return {
          transactionId: transaction.id,
          status: transaction.status,
          balance: wallet.balance.toJSON(),
          version: wallet.version,
          idempotentReplay: false,
        };
      }

      const direction = transaction.ledgerDirectionFor(reference);
      let movement;

      try {
        movement =
          direction === LedgerDirection.Debit
            ? wallet.debit(money)
            : wallet.credit(money);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'Insufficient wallet balance'
        ) {
          transaction.reject(INSUFFICIENT_FUNDS);
          await this.wagerTransactionRepository.save(transaction, em);

          return {
            transactionId: transaction.id,
            status: transaction.status,
            failureCode: transaction.failureCode,
            idempotentReplay: false,
          };
        }

        throw error;
      }

      transaction.markProcessed(reference?.id, new Date());
      transaction.recordResult(wallet.balance, wallet.version);

      const ledgerEntry = WalletLedgerEntry.create({
        id: randomUUID(),
        walletId: wallet.id,
        transactionId: transaction.id,
        direction,
        money,
        balanceBefore: movement.balanceBefore,
        balanceAfter: movement.balanceAfter,
      });

      await this.walletRepository.save(wallet, em);
      await this.wagerTransactionRepository.save(transaction, em);
      await this.walletLedgerRepository.save(ledgerEntry, em);

      return {
        transactionId: transaction.id,
        status: transaction.status,
        balance: wallet.balance.toJSON(),
        version: wallet.version,
        idempotentReplay: false,
      };
    });
  }
}
