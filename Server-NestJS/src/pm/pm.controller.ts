import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsIn, IsNumber } from 'class-validator';
import { PmService } from './pm.service';
import { CreateProjectDto, CreateMilestoneDto, CreateTaskDto, CreateRiskDto } from './dto/create-pm.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

class AddMemberDto {
  @IsNumber()
  userId!: number;
  @IsIn(['owner', 'member'])
  role!: string;
}

/** AI Project Management 旗舰应用：项目 / 成员 / 里程碑 / 任务 / 风险 */
@ApiTags('AI Project Management')
@ApiBearerAuth()
@FeatureFlag('pm')
@Controller({ path: 'pm', version: '1' })
export class PmController {
  constructor(private readonly pmService: PmService) {}

  // ── Project ───────────────────────────────────────────────

  @Post('projects')
  @ApiOperation({ summary: '创建项目' })
  createProject(@Body() dto: CreateProjectDto, @CurrentUser() user: JwtPayload) {
    return this.pmService.createProject(dto, user.sub);
  }

  @Get('projects')
  @ApiOperation({ summary: '项目列表（分页 + 状态/关键词筛选）' })
  listProjects(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.pmService.listProjects(user.sub, { page, limit, status, keyword });
  }

  @Get('projects/:id')
  @ApiOperation({ summary: '项目详情（含里程碑/任务/风险/成员数）' })
  getProjectDetail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.pmService.getProjectDetail(id, ability);
  }

  @Patch('projects/:id')
  @ApiOperation({ summary: '更新项目' })
  updateProject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateProjectDto,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.pmService.updateProject(id, dto, ability);
  }

  @Delete('projects/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除项目（软删）' })
  async removeProject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.pmService.removeProject(id, ability);
    return null;
  }

  @Get('projects/:id/analyze')
  @ApiOperation({ summary: '项目风险分析（逾期任务/里程碑/未解决风险）' })
  analyze(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.pmService.analyzeProjectRisk(id, user.sub);
  }

  // ── 子资源（成员 / 里程碑 / 任务 / 风险）─────────────────────

  @Get('projects/:id/members')
  @ApiOperation({ summary: '项目成员列表' })
  listMembers(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.pmService.listMembers(id, user.sub);
  }

  @Post('projects/:id/members')
  @ApiOperation({ summary: '添加成员' })
  addMember(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pmService.addMember(id, dto.userId, dto.role, user.sub);
  }

  @Get('projects/:id/milestones')
  @ApiOperation({ summary: '项目里程碑列表' })
  listMilestones(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.pmService.listMilestones(id, user.sub);
  }

  @Post('projects/:id/milestones')
  @ApiOperation({ summary: '创建里程碑' })
  createMilestone(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMilestoneDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pmService.createMilestone(id, dto, user.sub);
  }

  @Get('projects/:id/tasks')
  @ApiOperation({ summary: '项目任务列表' })
  listTasks(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.pmService.listTasks(user.sub, id);
  }

  @Get('tasks')
  @ApiOperation({ summary: '我的项目任务列表' })
  listMyTasks(@CurrentUser() user: JwtPayload) {
    return this.pmService.listTasks(user.sub);
  }

  @Post('tasks')
  @ApiOperation({ summary: '创建项目任务' })
  createTask(@Body() dto: CreateTaskDto, @CurrentUser() user: JwtPayload) {
    return this.pmService.createTask(dto, user.sub);
  }

  @Post('tasks/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '完成任务' })
  completeTask(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.pmService.completeTask(id, user.sub);
  }

  @Get('projects/:id/risks')
  @ApiOperation({ summary: '项目风险列表' })
  listRisks(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.pmService.listRisks(id, user.sub);
  }

  @Post('projects/:id/risks')
  @ApiOperation({ summary: '创建风险记录' })
  createRisk(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateRiskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pmService.createRisk(id, dto, user.sub);
  }
}
