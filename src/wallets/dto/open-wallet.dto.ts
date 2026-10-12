import {
  IsDefined,
  IsNotEmpty,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class InitialBalanceDto {
  @IsDefined()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message:
      'amount must be a non-negative monetary amount with up to 2 decimal places',
  })
  amount!: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  currency!: string;
}

export class OpenWalletDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => InitialBalanceDto)
  initialBalance!: InitialBalanceDto;
}
