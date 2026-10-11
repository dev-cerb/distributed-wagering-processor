import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Money } from '../../shared/domain/money.js';
import { WalletEntity } from '../../wallets/entities/wallet.entity.js';
import { WagerTransactionEntity } from '../../wager-transactions/entities/wager-transaction.entity.js';
import { WalletLedgerEntry } from '../domain/wallet-ledger-entry.js';
import { WalletLedgerEntryEntity } from '../entities/wallet-ledger-entry.entity.js';
import { WalletLedgerRepository } from './wallet-ledger.repository.js';

export class WalletLedgerRepositoryImpl implements WalletLedgerRepository {
  constructor(
    @InjectRepository(WalletLedgerEntryEntity)
    private readonly ledgerRepository: EntityRepository<WalletLedgerEntryEntity>,
  ) {}

  async findById(id: string): Promise<WalletLedgerEntry | null> {
    const entity = await this.ledgerRepository.findOne({ id });

    return entity ? this.toDomain(entity) : null;
  }

  async findByTransactionId(
    transactionId: string,
  ): Promise<WalletLedgerEntry[]> {
    const entities = await this.ledgerRepository.find({
      transaction: { id: transactionId },
    });

    return entities.map((entity) => this.toDomain(entity));
  }

  async save(entry: WalletLedgerEntry, em: EntityManager): Promise<void> {
    const repository = em.getRepository(WalletLedgerEntryEntity);

    const entity = repository.create({
      id: entry.id,
      wallet: em.getReference(WalletEntity, entry.walletId),
      transaction: em.getReference(WagerTransactionEntity, entry.transactionId),
      direction: entry.direction,
      amount: entry.money.toString(),
      currency: entry.money.currency,
      balanceBefore: entry.balanceBefore.toString(),
      balanceAfter: entry.balanceAfter.toString(),
      createdAt: entry.createdAt,
    });

    em.persist(entity);
  }

  private toDomain(entity: WalletLedgerEntryEntity): WalletLedgerEntry {
    return WalletLedgerEntry.rehydrate({
      id: entity.id,
      walletId: entity.wallet.id,
      transactionId: entity.transaction.id,
      direction: entity.direction,
      money: Money.from({
        amount: entity.amount,
        currency: entity.currency,
      }),
      balanceBefore: Money.from({
        amount: entity.balanceBefore,
        currency: entity.currency,
      }),
      balanceAfter: Money.from({
        amount: entity.balanceAfter,
        currency: entity.currency,
      }),
      createdAt: entity.createdAt,
    });
  }
}
