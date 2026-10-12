// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointRecordsController } from './point_records.controller';
import { PointRecordsService } from './point_records.service';
import { PointRecord } from './point_record.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PointRecord])],
  controllers: [PointRecordsController],
  providers: [PointRecordsService],
  exports: [PointRecordsService],
})
export class PointRecordsModule {}
