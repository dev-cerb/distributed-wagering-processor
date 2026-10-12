import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  EntityManager,
  EntityRepository,
  LockMode,
} from '@mikro-orm/postgresql';

import { Money } from '../../shared/domain/money.js';
import { WalletEntity } from '../../wallets/entities/wallet.entity.js';
import { WagerTransaction } from '../domain/wager-transaction.js';
import { WagerTransactionEntity } from '../entities/wager-transaction.entity.js';
import { WagerTransactionRepository } from './wager-transaction.repository.js';

@Injectable()
export class WagerTransactionRepositoryImpl implements WagerTransactionRepository {
  constructor(
    @InjectRepository(WagerTransactionEntity)
    private readonly repository: EntityRepository<WagerTransactionEntity>,
  ) {}

  async findByIdForRead(id: string): Promise<WagerTransaction | null> {
    const entity = await this.repository.findOne({ id });

    if (!entity) {
      return null;
    }

    return this.toDomain(entity);
  }

  async findById(
    id: string,
    em: EntityManager,
  ): Promise<WagerTransaction | null> {
    const repository = em.getRepository(WagerTransactionEntity);
    const entity = await repository.findOne({ id });

    if (!entity) {
      return null;
    }

    return this.toDomain(entity);
  }

  async findByProviderAndExternalTransactionIdForRead(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.repository.findOne({
      providerId,
      externalTransactionId,
    });

    if (!entity) {
      return null;
    }

    return this.toDomain(entity);
  }

  async findByProviderAndExternalTransactionId(
    providerId: string,
    externalTransactionId: string,
    em: EntityManager,
  ): Promise<WagerTransaction | null> {
    const repository = em.getRepository(WagerTransactionEntity);

    const entity = await repository.findOne({
      providerId,
      externalTransactionId,
    });

    if (!entity) {
      return null;
    }

    return this.toDomain(entity);
  }

  async findByProviderAndIdempotencyKey(
    providerId: string,
    idempotencyKey: string,
    em: EntityManager,
  ): Promise<WagerTransaction | null> {
    const repository = em.getRepository(WagerTransactionEntity);

    const entity = await repository.findOne({
      providerId,
      idempotencyKey,
    });

    if (!entity) {
      return null;
    }

    return this.toDomain(entity);
  }

  async findByReferenceTransactionId(
    referenceTransactionId: string,
    em: EntityManager,
  ): Promise<WagerTransaction[]> {
    const repository = em.getRepository(WagerTransactionEntity);

    const entities = await repository.find({
      referenceTransaction: { id: referenceTransactionId },
    });

    return entities.map((entity) => this.toDomain(entity));
  }

  async findByIdForUpdate(
    id: string,
    em: EntityManager,
  ): Promise<WagerTransaction | null> {
    const repository = em.getRepository(WagerTransactionEntity);

    const entity = await repository.findOne(
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );

    if (!entity) {
      return null;
    }

    return this.toDomain(entity);
  }

  async save(transaction: WagerTransaction, em: EntityManager): Promise<void> {
    const repository = em.getRepository(WagerTransactionEntity);

    let entity = await repository.findOne({
      id: transaction.id,
    });

    const data = {
      providerId: transaction.providerId,
      externalTransactionId: transaction.externalTransactionId,
      idempotencyKey: transaction.idempotencyKey,
      payloadHash: transaction.payloadHash,
      wallet: em.getReference(WalletEntity, transaction.walletId),
      playerId: transaction.playerId,
      roundId: transaction.roundId,
      gameId: transaction.gameId,
      kind: transaction.kind,
      amount: transaction.money.toString(),
      currency: transaction.money.currency,
      referenceExternalTransactionId:
        transaction.referenceExternalTransactionId ?? null,
      referenceTransaction: transaction.referenceTransactionId
        ? em.getReference(
            WagerTransactionEntity,
            transaction.referenceTransactionId,
          )
        : null,
      status: transaction.status,
      failureCode: transaction.failureCode ?? null,
      processedAt: transaction.processedAt ?? null,
      resultBalance: transaction.resultBalance?.toString() ?? null,
      resultWalletVersion: transaction.resultWalletVersion ?? null,
    };

    if (entity) {
      repository.assign(entity, data);
    } else {
      entity = repository.create({
        id: transaction.id,
        ...data,
        createdAt: transaction.createdAt,
      });
    }

    em.persist(entity);
  }

  private toDomain(entity: WagerTransactionEntity): WagerTransaction {
    return WagerTransaction.rehydrate({
      id: entity.id,
      providerId: entity.providerId,
      externalTransactionId: entity.externalTransactionId,
      idempotencyKey: entity.idempotencyKey,
      payloadHash: entity.payloadHash,
      walletId: entity.wallet.id,
      playerId: entity.playerId,
      roundId: entity.roundId,
      gameId: entity.gameId,
      kind: entity.kind,
      money: Money.from({
        amount: entity.amount,
        currency: entity.currency,
      }),
      referenceExternalTransactionId:
        entity.referenceExternalTransactionId ?? undefined,
      createdAt: entity.createdAt,
      status: entity.status,
      referenceTransactionId: entity.referenceTransaction?.id,
      failureCode: entity.failureCode ?? undefined,
      processedAt: entity.processedAt ?? undefined,
      resultBalance: entity.resultBalance
        ? Money.from({
            amount: entity.resultBalance,
            currency: entity.currency,
          })
        : undefined,
      resultWalletVersion: entity.resultWalletVersion ?? undefined,
    });
  }
}
