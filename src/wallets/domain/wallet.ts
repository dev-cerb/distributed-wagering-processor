import { Money } from '../../shared/domain/money.js';

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletMovement {
  direction: 'DEBIT' | 'CREDIT';
  money: Money;
  balanceBefore: Money;
  balanceAfter: Money;
  walletVersion: number;
  occurredAt: Date;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: {
    id: string;
    playerId: string;
    initialBalance: Money;
  }): Wallet {
    const { id, playerId, initialBalance } = props;

    if (!id.trim()) {
      throw new Error('Wallet id is required');
    }

    if (!playerId.trim()) {
      throw new Error('Player id is required');
    }

    if (initialBalance.isNegative()) {
      throw new Error('Initial balance cannot be negative');
    }

    const now = new Date();

    return new Wallet(
      id,
      playerId,
      initialBalance.currency,
      initialBalance,
      1,
      now,
      now,
    );
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(amount: Money): WalletMovement {
    this.assertSameCurrency(amount);

    if (!amount.isPositive()) {
      throw new Error('Debit amount must be positive');
    }

    if (this._balance.isLessThan(amount)) {
      throw new Error('Insufficient wallet balance');
    }

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.subtract(amount);
    const occurredAt = new Date();

    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = occurredAt;

    return {
      direction: 'DEBIT',
      money: amount,
      balanceBefore,
      balanceAfter,
      walletVersion: this._version,
      occurredAt,
    };
  }

  credit(amount: Money): WalletMovement {
    this.assertSameCurrency(amount);

    if (!amount.isPositive()) {
      throw new Error('Credit amount must be positive');
    }

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.add(amount);
    const occurredAt = new Date();

    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = occurredAt;

    return {
      direction: 'CREDIT',
      money: amount,
      balanceBefore,
      balanceAfter,
      walletVersion: this._version,
      occurredAt,
    };
  }

  private assertSameCurrency(money: Money): void {
    if (this.currency !== money.currency) {
      throw new Error('Currency mismatch');
    }
  }
}
