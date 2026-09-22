// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TodosController } from './todos.controller';
import { TodosService } from './todos.service';
import { Todo } from './todo.entity';
import { OrgModule } from '../org/org.module';
import { WebhookModule } from '../webhooks/webhook.module';

// （阶段 4 环根治：该链末端已是叶子模块，普通 import 即可）
@Module({
  imports: [TypeOrmModule.forFeature([Todo]), OrgModule, WebhookModule],
  controllers: [TodosController],
  providers: [TodosService],
  exports: [TodosService],
})
export class TodosModule {}
