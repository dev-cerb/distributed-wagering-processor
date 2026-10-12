import {
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

import { WagerTransactionKind } from '../domain/wager-transaction.js';

export class ProcessWagerTransactionDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  externalTransactionId!: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  walletId!: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  roundId!: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  gameId!: string;

  @IsDefined()
  @IsEnum(WagerTransactionKind)
  kind!: WagerTransactionKind;

  @IsDefined()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  referenceExternalTransactionId?: string;
}
