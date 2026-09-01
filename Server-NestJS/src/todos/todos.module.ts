// SPDX-License-Identifier: Apache-2.0

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TodosController } from './todos.controller';
import { TodosService } from './todos.service';
import { Todo } from './todo.entity';
import { OrgModule } from '../org/org.module';
import { WebhookModule } from '../webhooks/webhook.module';

// forwardRef：todos→org→flows→ai→events→org 链与 events 同向，避免新增环
@Module({
  imports: [TypeOrmModule.forFeature([Todo]), forwardRef(() => OrgModule), WebhookModule],
  controllers: [TodosController],
  providers: [TodosService],
  exports: [TodosService],
})
export class TodosModule {}
