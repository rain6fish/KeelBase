// SPDX-License-Identifier: Apache-2.0

import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray, IsBoolean, MaxLength } from 'class-validator';
import { AdminService } from './admin.service';
import { AdminObservabilityService } from './admin-observability.service';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { HeadlessKeysService } from '../headless/headless-keys.service';
import { BehaviorBaselineService } from '../ai/behavior-baseline/behavior-baseline.service';

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
    // 平台观测域（阶段 3 第十四刀）：监控摘要 / 运维摘要已独立
    private readonly adminObservability: AdminObservabilityService,
    private readonly headlessKeysService: HeadlessKeysService,
    // BA 异常行为基线：告警列表与标记已处理（检测本身跑在定时任务里，此处只读/标记）
    private readonly behaviorBaseline: BehaviorBaselineService,
  ) {}

  /**
   * BA 异常行为基线：告警列表（docs/ai-behavior-baseline.spec.md §7）。
   * 默认只列**未处理**的；`status=all` 看全部，`level` 可按级别过滤。
   * 这些是**观测**不是判决——UI 与服务端措辞都不做「恶意」断言。
   */
  @Get('ai/behavior-alerts')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'AI 异常行为告警列表（BA 基线）' })
  async behaviorAlerts(@Query('status') status?: string, @Query('level') level?: string) {
    const statuses = ['open', 'acknowledged', 'all'] as const;
    const statusFilter = statuses.find((s) => s === status);
    return this.behaviorBaseline.list({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(level === 'warning' || level === 'critical' ? { level } : {}),
    });
  }

  /** BA：标记告警已处理（人工动作；本能力不自动处置）。 */
  @Post('ai/behavior-alerts/:id/acknowledge')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '标记 AI 异常行为告警已处理（BA 基线）' })
  async acknowledgeBehaviorAlert(@Param('id', ParseIntPipe) id: number) {
    const ok = await this.behaviorBaseline.acknowledge(id);
    if (!ok) throw new NotFoundException('告警不存在或已处理');
    return { ok: true };
  }

  @Get('monitor/summary')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '运行状态聚合（健康/依赖/指标/告警）' })
  getMonitorSummary() {
    return this.adminObservability.getMonitorSummary();
  }

  @Get('ops/summary')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'D.8 运维单页聚合（派生告警 + 指标 + 近 24h 错误 + 7 天趋势）' })
  getOpsSummary() {
    return this.adminObservability.getOpsSummary();
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
  @ApiOperation({ summary: '回收站：所有可软删实体的已删记录（可恢复）' })
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
  // The set of valid `type` values is derived from entity metadata, so it cannot be spelled out
  // here — the service rejects anything it does not recognise.
  //
  // 合法 `type` 的集合由实体元数据派生，无法在这里枚举 —— 服务会拒绝它不认识的取值。
  @ApiOperation({ summary: '恢复回收站记录（type 见 GET /admin/trash 返回的 type）' })
  restoreTrash(@Param('type') type: string, @Param('id', ParseIntPipe) id: number) {
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
