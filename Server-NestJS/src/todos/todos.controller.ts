import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TodosService } from './todos.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@ApiTags('待办')
@ApiBearerAuth()
@FeatureFlag('todos')
@Controller({ path: 'todos', version: '1' })
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Post()
  @ApiOperation({ summary: '创建待办' })
  async create(@Body() dto: CreateTodoDto, @CurrentUser() user: JwtPayload) {
    return this.todosService.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: '获取我的待办列表' })
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.todosService.findAll(user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新待办' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTodoDto,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.todosService.update(id, dto, ability, user.sub);
  }

  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '切换待办完成状态' })
  async toggleComplete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    const todo = await this.todosService.findOne(id, ability, user.sub);
    return this.todosService.update(
      id,
      { completed: !todo.completed },
      ability,
      user.sub,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除待办' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.todosService.remove(id, ability, user.sub);
    return null;
  }
}
