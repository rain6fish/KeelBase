import { Injectable, NotFoundException, ForbiddenException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { Todo } from './todo.entity';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';
import { OrgService } from '../org/org.service';

@Injectable()
export class TodosService {
  constructor(
    @InjectRepository(Todo)
    private readonly todosRepository: Repository<Todo>,
    @Optional() private readonly orgService?: OrgService,
  ) {}

  async create(dto: CreateTodoDto, userId: number): Promise<Todo> {
    // ORG-3 二期：创建时自动归属用户所属组织（同组织成员可见）
    const orgId = await this._userOrgId(userId);
    const todo = this.todosRepository.create({
      ...dto,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      userId,
      orgId: orgId ?? undefined,
    });
    return this.todosRepository.save(todo);
  }

  async findAll(userId: number): Promise<Todo[]> {
    // ORG-3 二期：本人待办 OR 同组织待办
    const orgId = await this._userOrgId(userId);
    const where: any[] = [{ userId }];
    if (orgId != null) where.push({ orgId });
    return this.todosRepository.find({
      where,
      order: { completed: 'ASC', createdAt: 'DESC' },
    });
  }

  /** ORG-3：取用户所属组织 id（非成员或未注入 orgService 返回 null） */
  private async _userOrgId(userId?: number): Promise<number | null> {
    if (!userId || !this.orgService) return null;
    try {
      return await this.orgService.getUserOrgId(userId);
    } catch {
      return null;
    }
  }

  async findOne(id: number, ability: AppAbility): Promise<Todo> {
    const todo = await this.todosRepository.findOne({ where: { id } });
    if (!todo) throw new NotFoundException('Todo not found');
    if (ability.cannot('read', subject('Todo', todo))) {
      throw new ForbiddenException('无权访问此待办');
    }
    return todo;
  }

  async update(id: number, dto: UpdateTodoDto, ability: AppAbility): Promise<Todo> {
    const todo = await this.findOne(id, ability);
    const updateData: any = { ...dto };
    if (dto.dueDate) updateData.dueDate = new Date(dto.dueDate);
    Object.assign(todo, updateData);
    return this.todosRepository.save(todo);
  }

  async remove(id: number, ability: AppAbility): Promise<void> {
    const todo = await this.findOne(id, ability);
    // RG-3 软删除：置 deleted_at，管理台回收站可恢复
    await this.todosRepository.softDelete(todo.id);
  }
}
