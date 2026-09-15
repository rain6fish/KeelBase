// SPDX-License-Identifier: Apache-2.0

import { Injectable, NotFoundException, ForbiddenException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { Todo } from './todo.entity';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';
import { OrgService } from '../org/org.service';
import type { WebhookPublisher } from '../webhooks/webhook.service';
import { defaultScopeDescriptor, type OrgContext } from '../common/scope/scope-policy';
import { buildScopeWhere, rowInScope } from '../common/scope/scope-where';
import { DataScopeService } from '../authz/data-scope.service';

@Injectable()
export class TodosService {
  constructor(
    @InjectRepository(Todo)
    private readonly todosRepository: Repository<Todo>,
    @Optional() private readonly orgService?: OrgService,
    @Optional() private readonly webhookPublisher?: WebhookPublisher,
    @Optional() private readonly dataScope?: DataScopeService,
  ) {}

  /** 权限-2：范围来源优先角色配置（DataScopeService），缺席回退内置默认（逐 subject 复刻旧行为） */
  private async _scopeFor(userId: number) {
    return this.dataScope
      ? this.dataScope.resolve(userId, 'Todo')
      : defaultScopeDescriptor(userId, 'Todo', await this._orgContext(userId));
  }

  async create(dto: CreateTodoDto, userId: number): Promise<Todo> {
    // ORG-3 二期：创建时自动归属用户所属组织（同组织成员可见）
    // A11：组织内新待办强制共享是设计（「同组织成员可见」），暂无 per-todo 私有化 opt-out；
    // 非组织成员创建的不带 orgId，仅本人可见。
    const ctx = await this._orgContext(userId);
    const todo = this.todosRepository.create({
      ...dto,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      userId,
      orgId: ctx?.orgId ?? undefined,
      deptId: ctx?.deptId ?? undefined,
    });
    const saved = await this.todosRepository.save(todo);
    // PL-14：待办创建事件发布（订阅 todo.created 的 webhook 收到投递）
    if (this.webhookPublisher) {
      await this.webhookPublisher
        .publish('todo.created', { todoId: saved.id, title: saved.title, userId })
        .catch(() => undefined);
    }
    return saved;
  }

  async findAll(userId: number): Promise<Todo[]> {
    // 权限-2：行级数据范围（默认级别 = ORG-3 语义「本人 OR 同组织」；可按角色配置）
    const descriptor = await this._scopeFor(userId);
    const where = (buildScopeWhere<Todo>(descriptor, 'Todo') ?? [{}]) as any;
    return this.todosRepository.find({
      where,
      order: { completed: 'ASC', createdAt: 'DESC' },
    });
  }

  /** ORG-3 + 权限-2：用户的组织上下文（orgId + deptId）；非成员或未注入 orgService → null */
  private async _orgContext(userId?: number): Promise<OrgContext | null> {
    if (!userId || !this.orgService) return null;
    try {
      return await this.orgService.getUserOrgContext(userId);
    } catch {
      return null;
    }
  }

  async findOne(id: number, ability: AppAbility, userId?: number): Promise<Todo> {
    const todo = await this.todosRepository.findOne({ where: { id } });
    if (!todo) throw new NotFoundException('Todo not found');
    if (!(await this._canAccess(todo, ability, userId))) {
      throw new ForbiddenException('无权访问此待办');
    }
    return todo;
  }

  async update(
    id: number,
    dto: UpdateTodoDto,
    ability: AppAbility,
    userId?: number,
  ): Promise<Todo> {
    const todo = await this.findOne(id, ability, userId);
    const updateData: any = { ...dto };
    if (dto.dueDate) updateData.dueDate = new Date(dto.dueDate);
    Object.assign(todo, updateData);
    return this.todosRepository.save(todo);
  }

  async remove(id: number, ability: AppAbility, userId?: number): Promise<void> {
    const todo = await this.findOne(id, ability, userId);
    // RG-3 软删除：置 deleted_at，管理台回收站可恢复
    await this.todosRepository.softDelete(todo.id);
  }

  /**
   * ORG-3 统一访问控制：本人（CASL 所有权）或同组织成员可读/管理，
   * 与列表层（本人 OR 同组织）保持一致，消除「列表可见但明细 403」的半套隔离。
   */
  private async _canAccess(
    todo: Todo,
    ability: AppAbility,
    userId?: number,
  ): Promise<boolean> {
    if (ability.can('read', subject('Todo', todo))) return true;
    if (userId == null) return false;
    // 权限-2：范围扩展与列表 where 同源（消除「列表可见但明细 403」的半套隔离）
    const descriptor = await this._scopeFor(userId);
    return rowInScope(todo as unknown as Record<string, unknown>, descriptor, 'Todo');
  }
}
