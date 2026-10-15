// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetLoansController } from './asset_loans.controller';
import { AssetLoansService } from './asset_loans.service';
import { AssetLoan } from './asset_loan.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AssetLoan])],
  controllers: [AssetLoansController],
  providers: [AssetLoansService],
  exports: [AssetLoansService],
})
export class AssetLoansModule {}
