// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointsController } from './points.controller';
import { PointsService } from './points.service';
import { PointsEntry } from './points-entry.entity';
import { User } from '../common/entities/user.entity';
import { UploadSignService } from '../upload/upload-sign.service';

@Module({
  imports: [TypeOrmModule.forFeature([PointsEntry, User])],
  controllers: [PointsController],
  providers: [PointsService, UploadSignService],
  exports: [PointsService],
})
export class PointsModule {}
