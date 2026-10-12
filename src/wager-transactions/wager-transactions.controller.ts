import {
  Body,
  Controller,
  Headers,
  Post,
  BadRequestException,
  Get,
  Param,
} from '@nestjs/common';

import { ProcessWagerTransactionDto } from './dto/process-wager-transaction.dto.js';
import { ProcessWagerTransactionUseCase } from './use-cases/process-wager-transaction.use-case.js';

import { WagerTransactionsService } from './wager-transactions.service.js';

@Controller('wagering/transactions')
export class WagerTransactionsController {
  constructor(
    private readonly processWagerTransaction: ProcessWagerTransactionUseCase,
    private readonly wagerTransactionsService: WagerTransactionsService,
  ) {}

  @Post()
  async submit(
    @Body() body: ProcessWagerTransactionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.processWagerTransaction.execute({
      providerId: body.providerId,
      externalTransactionId: body.externalTransactionId,
      idempotencyKey,
      walletId: body.walletId,
      playerId: body.playerId,
      roundId: body.roundId,
      gameId: body.gameId,
      kind: body.kind,
      amount: body.money.amount,
      currency: body.money.currency,
      referenceExternalTransactionId: body.referenceExternalTransactionId,
    });
  }

  @Get(':transactionId')
  async getById(@Param('transactionId') transactionId: string) {
    return this.wagerTransactionsService.getById(transactionId);
  }
}
