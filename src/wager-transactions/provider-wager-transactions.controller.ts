import { Controller, Get, Param } from '@nestjs/common';

import { WagerTransactionsService } from './wager-transactions.service.js';

@Controller('providers')
export class ProviderWagerTransactionsController {
  constructor(
    private readonly wagerTransactionsService: WagerTransactionsService,
  ) {}

  @Get(':providerId/wagering/transactions/:externalTransactionId')
  async getByExternalId(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ) {
    return this.wagerTransactionsService.getByExternalId(
      providerId,
      externalTransactionId,
    );
  }
}
