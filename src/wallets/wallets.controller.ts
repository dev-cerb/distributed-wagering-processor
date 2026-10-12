import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';

import { WalletsService } from './wallets.service.js';
import { OpenWalletDto } from './dto/open-wallet.dto.js';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  async open(@Body() body: OpenWalletDto) {
    return this.walletsService.open(body);
  }

  @Get(':walletId')
  async getWallet(@Param('walletId') walletId: string) {
    return this.walletsService.getWallet(walletId);
  }

  @Post(':walletId/reconciliation')
  @HttpCode(200)
  async reconcileWallet(@Param('walletId') walletId: string) {
    return this.walletsService.reconcileWallet(walletId);
  }

  @Get(':walletId/ledger')
  async getLedger(
    @Param('walletId') walletId: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.walletsService.getLedger(walletId, limit ?? 50, cursor);
  }
}
