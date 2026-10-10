import { randomUUID } from 'node:crypto';
import {
  Check,
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'wallets' })
@Unique({
  name: 'wallets_player_currency_unique',
  properties: ['playerId', 'currency'],
})
@Check({
  name: 'wallets_balance_non_negative',
  expression: 'balance >= 0',
})
export class WalletEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property({ type: 'string', length: 255 })
  playerId!: string;

  @Property({ type: 'string', length: 3 })
  currency!: string;

  @Property({ type: 'string', columnType: 'numeric(18,2)' })
  balance = '0.00';

  @Property({ type: 'integer', default: 1 })
  version = 1;

  @Property({ type: 'Date', defaultRaw: 'now()' })
  createdAt = new Date();

  @Property({
    type: 'Date',
    defaultRaw: 'now()',
    onUpdate: () => new Date(),
  })
  updatedAt = new Date();
}
