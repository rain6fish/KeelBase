import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { Todo } from './todo.entity';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@Injectable()
export class TodosService {
  constructor(
    @InjectRepository(Todo)
    private readonly todosRepository: Repository<Todo>,
  ) {}

  async create(dto: CreateTodoDto, userId: number): Promise<Todo> {
    const todo = this.todosRepository.create({
      ...dto,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      userId,
    });
    return this.todosRepository.save(todo);
  }

  async findAll(userId: number): Promise<Todo[]> {
    return this.todosRepository.find({
      where: { userId },
      order: { completed: 'ASC', createdAt: 'DESC' },
    });
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
    await this.todosRepository.delete(todo.id);
  }
}
