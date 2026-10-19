// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryMovementsController } from './inventory_movements.controller';
import { InventoryMovementsService } from './inventory_movements.service';
import { InventoryMovement } from './inventory_movement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryMovement])],
  controllers: [InventoryMovementsController],
  providers: [InventoryMovementsService],
  exports: [InventoryMovementsService],
})
export class InventoryMovementsModule {}
