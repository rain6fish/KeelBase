// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointsLedgersController } from './points_ledgers.controller';
import { PointsLedgersService } from './points_ledgers.service';
import { PointsLedger } from './points_ledger.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PointsLedger])],
  controllers: [PointsLedgersController],
  providers: [PointsLedgersService],
  exports: [PointsLedgersService],
})
export class PointsLedgersModule {}
