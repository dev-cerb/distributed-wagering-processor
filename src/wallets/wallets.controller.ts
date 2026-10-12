import { Body, Controller, Post } from '@nestjs/common';

import { WalletsService } from './wallets.service.js';
import { OpenWalletDto } from './dto/open-wallet.dto.js';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  async open(@Body() body: OpenWalletDto) {
    return this.walletsService.open(body);
  }
}
