// SPDX-License-Identifier: Apache-2.0

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { subject } from '@casl/ability';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import type { AppAbility } from '../common/casl/casl-ability.factory';

/** 允许排序的白名单字段，防止 injection */
const ALLOWED_SORT_FIELDS = new Set([
  'id', 'username', 'nickname', 'createdAt', 'updatedAt',
]);

@ApiTags('用户')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '创建用户（管理员）' })
  @ApiCreatedResponse({ description: '创建成功' })
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '分页查询用户列表（管理员）' })
  @ApiOkResponse({ description: '查询成功' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'sort', required: false, example: 'createdAt' })
  @ApiQuery({ name: 'order', required: false, example: 'desc' })
  async findAll(@Query() query: PaginationDto) {
    const sort = query.sort && ALLOWED_SORT_FIELDS.has(query.sort)
      ? query.sort
      : 'createdAt';
    const order = query.order === 'asc' ? 'asc' : 'desc';
    return this.usersService.findAll(
      query.page,
      query.limit,
      sort,
      order,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '获取用户详情' })
  @ApiOkResponse({ description: '查询成功' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAbility() ability: AppAbility,
  ) {
    if (ability.cannot('read', subject('User', { id }))) {
      throw new ForbiddenException('无权访问其他用户信息');
    }
    // CR-4：管理端视图走 sanitizeForAdmin（email/phone 掩码，bio/生日/名姓不返回）
    return this.usersService.findOne(id, ability.can('manage', 'all'));
  }

  @Put(':id')
  @ApiOperation({ summary: '更新用户信息' })
  @ApiOkResponse({ description: '更新成功' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentAbility() ability: AppAbility,
  ) {
    if (ability.cannot('update', subject('User', { id }))) {
      throw new ForbiddenException('无权修改其他用户信息');
    }
    return this.usersService.update(id, dto);
  }

  @Post(':id/must-change-password')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'WEB-FRONT-4：标记用户下次登录需改密（管理员）' })
  async mustChangePassword(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.sub === id) {
      throw new BadRequestException('不能给自己设强制改密');
    }
    return this.usersService.forceChangePassword(id);
  }

  @Patch(':id/role')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '修改用户角色（管理员）' })
  @ApiOkResponse({ description: '角色修改成功' })
  async updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.sub === id) {
      throw new BadRequestException('不能修改自己的角色');
    }
    return this.usersService.updateRole(id, dto.role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除用户' })
  @ApiOkResponse({ description: '删除成功' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    if (user.sub === id) {
      throw new BadRequestException('不能删除自己的账号');
    }
    if (ability.cannot('delete', subject('User', { id }))) {
      throw new ForbiddenException('无权删除其他用户');
    }
    await this.usersService.remove(id);
    return null;
  }
}
