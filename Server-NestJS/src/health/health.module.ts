// SPDX-License-Identifier: Apache-2.0

 import { Module } from '@nestjs/common';
 import { ConfigModule } from '@nestjs/config';
 import { HealthController } from './health.controller';
 import { StorageModule } from '../storage/storage.module';

 @Module({
   imports: [ConfigModule, StorageModule],
   controllers: [HealthController],
 })
 export class HealthModule {}
