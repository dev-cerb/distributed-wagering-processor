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

  async findByWalletId(
    walletId: string,
    limit: number,
    cursor?: {
      createdAt: Date;
      id: string;
    },
  ): Promise<WalletLedgerEntry[]> {
    const where: Record<string, unknown> = {
      wallet: { id: walletId },
    };

    if (cursor) {
      where.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        {
          createdAt: cursor.createdAt,
          id: { $lt: cursor.id },
        },
      ];
    }

    const entities = await this.ledgerRepository.find(where, {
      orderBy: { createdAt: 'DESC', id: 'DESC' },
      limit,
    });

    return entities.map((entity) => this.toDomain(entity));
  }

  async reconcileWalletBalance(walletId: string): Promise<{
    entryCount: number;
    reconstructedBalance: string;
  }> {
    const result = await this.ledgerRepository
      .getEntityManager()
      .getConnection()
      .execute<
        {
          entry_count: string;
          reconstructed_balance: string;
        }[]
      >(
        `
      SELECT
        COUNT(*)::text AS entry_count,
        COALESCE(
          SUM(
            CASE
              WHEN direction = 'CREDIT' THEN amount
              WHEN direction = 'DEBIT' THEN -amount
              ELSE 0
            END
          ),
          0
        )::numeric(18, 2)::text AS reconstructed_balance
      FROM wallet_ledger_entries
      WHERE wallet_id = ?
    `,
        [walletId],
      );

    return {
      entryCount: Number(result[0]?.entry_count ?? 0),
      reconstructedBalance: result[0]?.reconstructed_balance ?? '0.00',
    };
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
