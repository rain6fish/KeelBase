import { Controller, Get, Post, Delete, Patch, Param, Query, Body, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray, IsBoolean, MaxLength } from 'class-validator';
import { AdminService } from './admin.service';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { HeadlessKeysService } from '../headless/headless-keys.service';

class CreateHeadlessKeyDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsNumber()
  ownerUserId?: number;

  @IsOptional()
  @IsArray()
  toolWhitelist?: string[];

  @IsOptional()
  @IsNumber()
  quotaPerDay?: number;
}

class UpdateHeadlessKeyDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsNumber()
  ownerUserId?: number;

  @IsOptional()
  @IsArray()
  toolWhitelist?: string[] | null;

  @IsOptional()
  @IsNumber()
  quotaPerDay?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

@ApiTags('管理台（聚合）')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly headlessKeysService: HeadlessKeysService,
  ) {}

  @Get('monitor/summary')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '运行状态聚合（健康/依赖/指标/告警）' })
  getMonitorSummary() {
    return this.adminService.getMonitorSummary();
  }

  @Get('overview')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '平台数据总览（用户/事件/待办/通知/审计/存储 + 趋势）' })
  @ApiQuery({ name: 'days', required: false, example: 7, description: '趋势天数，默认 7' })
  getOverview(@Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number) {
    const since = new Date();
    since.setDate(since.getDate() - Math.min(Math.max(days, 1), 90));
    return this.adminService.getOverview(since);
  }

  @Get('sessions')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '全部在线会话（管理员视角）' })
  getSessions() {
    return this.adminService.getSessions();
  }

  @Get('users/:id/detail')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '用户详情聚合（脱敏信息 + 会话 + 通知 + 统计）' })
  getUserDetail(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getUserDetail(id);
  }

  @Delete('sessions/:id')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '强制下线指定会话' })
  async revokeSession(@Param('id', ParseIntPipe) id: number) {
    await this.adminService.revokeSession(id);
    return null;
  }

  @Post('notifications/broadcast')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '通知广播（全体/指定用户）' })
  broadcast(@Body() dto: BroadcastNotificationDto) {
    return this.adminService.broadcast(dto);
  }

  @Get('analytics')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'PL-15 平台数据统计：活跃/留存/功能漏斗/错误大盘' })
  @ApiQuery({ name: 'days', required: false, example: 30, description: '统计窗口天数，默认 30' })
  getAnalytics(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.adminService.getAnalytics(days);
  }

  @Get('trash')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '回收站：已软删除的事件/待办（可恢复）' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  getTrash(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.getTrash(page, Math.min(Math.max(limit, 1), 100));
  }

  @Post('trash/:type/:id/restore')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '恢复回收站记录（type: event|todo）' })
  restoreTrash(
    @Param('type') type: 'event' | 'todo',
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.adminService.restoreTrashItem(type, id);
  }

  // ── HS-4 headless API Key 管理 ──────────────────────────

  @Get('headless-keys')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'headless API Key 列表（HS-4）' })
  listHeadlessKeys() {
    return this.headlessKeysService.list();
  }

  @Post('headless-keys')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '创建 headless API Key（HS-4，返回明文仅此一次）' })
  createHeadlessKey(@Body() dto: CreateHeadlessKeyDto) {
    return this.headlessKeysService.create(dto);
  }

  @Patch('headless-keys/:id')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '更新 headless API Key（HS-4：配额/工具范围/归属/启停）' })
  updateHeadlessKey(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateHeadlessKeyDto) {
    return this.headlessKeysService.update(id, dto);
  }

  @Delete('headless-keys/:id')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '删除 headless API Key（HS-4）' })
  async deleteHeadlessKey(@Param('id', ParseIntPipe) id: number) {
    await this.headlessKeysService.remove(id);
    return { deleted: true, id };
  }
}
