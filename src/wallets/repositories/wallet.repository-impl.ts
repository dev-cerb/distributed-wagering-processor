import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';

import { Money } from '../../shared/domain/money.js';
import { Wallet } from '../domain/wallet.js';
import { WalletEntity } from '../entities/wallet.entity.js';
import { WalletRepository } from './wallet.repository.js';

@Injectable()
export class WalletRepositoryImpl implements WalletRepository {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly repository: EntityRepository<WalletEntity>,
  ) {}

  async findByPlayerIdAndCurrency(
    playerId: string,
    currency: string,
  ): Promise<Wallet | null> {
    const entity = await this.repository.findOne({
      playerId,
      currency,
    });

    if (!entity) {
      return null;
    }

    return this.toDomain(entity);
  }

  async findById(id: string): Promise<Wallet | null> {
    const entity = await this.repository.findOne({ id });

    if (!entity) {
      return null;
    }

    return this.toDomain(entity);
  }

  async save(wallet: Wallet, em: EntityManager): Promise<void> {
    const repository = em.getRepository(WalletEntity);

    let entity = await repository.findOne({ id: wallet.id });

    const data = {
      playerId: wallet.playerId,
      currency: wallet.currency,
      balance: wallet.balance.toString(),
      version: wallet.version,
      updatedAt: wallet.updatedAt,
    };

    if (entity) {
      repository.assign(entity, data);
    } else {
      entity = repository.create({
        id: wallet.id,
        ...data,
        createdAt: wallet.createdAt,
      });
    }

    em.persist(entity);
  }
  private toDomain(entity: WalletEntity): Wallet {
    return Wallet.rehydrate({
      id: entity.id,
      playerId: entity.playerId,
      currency: entity.currency,
      balance: Money.from({
        amount: entity.balance,
        currency: entity.currency,
      }),
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }
}
