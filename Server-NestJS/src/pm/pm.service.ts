// SPDX-License-Identifier: Apache-2.0

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { subject } from '@casl/ability';
import { PmProject } from './pm-project.entity';
import { PmMember } from './pm-member.entity';
import { PmMilestone } from './pm-milestone.entity';
import { PmTask } from './pm-task.entity';
import { PmRisk } from './pm-risk.entity';
import { CreateProjectDto, CreateMilestoneDto, CreateTaskDto, CreateRiskDto } from './dto/create-pm.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

/** 项目列表筛选 */
export interface ProjectFilter {
  page?: number;
  limit?: number;
  status?: string;
  keyword?: string;
}

export interface ProjectRiskAnalysis {
  level: string;
  score: number;
  reasons: string[];
  dataPoints: {
    taskCount: number;
    overdueTasks: number;
    milestoneCount: number;
    overdueMilestones: number;
    openRisks: number;
  };
}

/**
 * AI Project Management：项目 / 成员 / 里程碑 / 任务 / 风险 服务。
 * 所有权 = userId（owner），AI 工具按同一数据范围运行。
 */
@Injectable()
export class PmService {
  constructor(
    @InjectRepository(PmProject)
    private readonly projects: Repository<PmProject>,
    @InjectRepository(PmMember)
    private readonly members: Repository<PmMember>,
    @InjectRepository(PmMilestone)
    private readonly milestones: Repository<PmMilestone>,
    @InjectRepository(PmTask)
    private readonly tasks: Repository<PmTask>,
    @InjectRepository(PmRisk)
    private readonly risks: Repository<PmRisk>,
  ) {}

  // ── Project CRUD ──────────────────────────────────────────

  async createProject(dto: CreateProjectDto, userId: number): Promise<PmProject> {
    const entity = this.projects.create({ ...dto, userId });
    return this.projects.save(entity);
  }

  async listProjects(
    userId: number,
    filter: ProjectFilter = {},
  ): Promise<{ items: PmProject[]; total: number }> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const qb = this.projects
      .createQueryBuilder('p')
      .where('p.userId = :userId', { userId })
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (filter.status) qb.andWhere('p.status = :status', { status: filter.status });
    if (filter.keyword) {
      qb.andWhere('(p.name LIKE :kw OR p.description LIKE :kw)', { kw: `%${filter.keyword}%` });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getProject(id: number, ability: AppAbility): Promise<PmProject> {
    const entity = await this.projects.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('项目不存在');
    if (ability.cannot('read', subject('PmProject', entity))) {
      throw new ForbiddenException('无权访问此项目');
    }
    return entity;
  }

  async updateProject(id: number, dto: CreateProjectDto, ability: AppAbility): Promise<PmProject> {
    const entity = await this.getProject(id, ability);
    Object.assign(entity, dto);
    return this.projects.save(entity);
  }

  async removeProject(id: number, ability: AppAbility): Promise<void> {
    const entity = await this.getProject(id, ability);
    await this.projects.softDelete(entity.id);
  }

  /** 项目详情聚合：项目 + 里程碑 + 任务 + 风险 + 成员数 */
  async getProjectDetail(
    id: number,
    ability: AppAbility,
  ): Promise<{
    project: PmProject;
    milestones: PmMilestone[];
    tasks: PmTask[];
    risks: PmRisk[];
    memberCount: number;
  }> {
    const project = await this.getProject(id, ability);
    const [milestones, tasks, risks, memberCount] = await Promise.all([
      this.milestones.find({ where: { projectId: id }, order: { dueDate: 'ASC' } }),
      this.tasks.find({ where: { projectId: id }, order: { createdAt: 'DESC' } }),
      this.risks.find({ where: { projectId: id }, order: { detectedAt: 'DESC' } }),
      this.members.count({ where: { projectId: id } }),
    ]);
    return { project, milestones, tasks, risks, memberCount };
  }

  // ── 子资源（成员 / 里程碑 / 任务 / 风险）────────────────────

  private async _assertProjectOwner(projectId: number, userId: number): Promise<PmProject> {
    const project = await this.projects.findOne({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException('项目不存在或无权访问');
    return project;
  }

  async listMembers(projectId: number, userId: number): Promise<PmMember[]> {
    await this._assertProjectOwner(projectId, userId);
    return this.members.find({ where: { projectId }, order: { createdAt: 'ASC' } });
  }

  async addMember(projectId: number, targetUserId: number, role: string, userId: number): Promise<PmMember> {
    await this._assertProjectOwner(projectId, userId);
    const existing = await this.members.findOne({ where: { projectId, userId: targetUserId } });
    if (existing) return existing;
    return this.members.save(this.members.create({ projectId, userId: targetUserId, role }));
  }

  async removeMember(projectId: number, memberId: number, userId: number): Promise<void> {
    await this._assertProjectOwner(projectId, userId);
    await this.members.delete({ id: memberId, projectId });
  }

  async listMilestones(projectId: number, userId: number): Promise<PmMilestone[]> {
    await this._assertProjectOwner(projectId, userId);
    return this.milestones.find({ where: { projectId }, order: { dueDate: 'ASC' } });
  }

  async createMilestone(projectId: number, dto: CreateMilestoneDto, userId: number): Promise<PmMilestone> {
    await this._assertProjectOwner(projectId, userId);
    return this.milestones.save(
      this.milestones.create({
        ...dto,
        projectId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      }),
    );
  }

  /** 任务列表（可按项目过滤；AI 写工具 create_project_task 复用） */
  async listTasks(
    userId: number,
    projectId?: number,
  ): Promise<{ items: PmTask[]; total: number }> {
    const where: Record<string, unknown> = { userId };
    if (projectId) where.projectId = projectId;
    const [items, total] = await this.tasks.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return { items, total };
  }

  /** 创建项目任务（AI 写工具 create_project_task 的目标） */
  async createTask(dto: CreateTaskDto, userId: number): Promise<PmTask> {
    await this._assertProjectOwner(Number(dto.projectId), userId);
    return this.tasks.save(
      this.tasks.create({
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        userId,
      }),
    );
  }

  async completeTask(id: number, userId: number): Promise<PmTask> {
    const task = await this.tasks.findOne({ where: { id, userId } });
    if (!task) throw new NotFoundException('任务不存在');
    task.status = 'completed';
    return this.tasks.save(task);
  }

  async listRisks(projectId: number, userId: number): Promise<PmRisk[]> {
    await this._assertProjectOwner(projectId, userId);
    return this.risks.find({ where: { projectId }, order: { detectedAt: 'DESC' } });
  }

  async createRisk(projectId: number, dto: CreateRiskDto, userId: number): Promise<PmRisk> {
    await this._assertProjectOwner(projectId, userId);
    return this.risks.save(
      this.risks.create({
        ...dto,
        projectId,
        detectedAt: dto.detectedAt ? new Date(dto.detectedAt) : new Date(),
      }),
    );
  }

  // ── 风险分析（analyze_project_risk 工具核心逻辑）───────────

  /** 计算项目风险：逾期任务/里程碑 + 项目状态 + 未解决风险 */
  async analyzeProjectRisk(projectId: number, userId: number): Promise<ProjectRiskAnalysis> {
    const project = await this._assertProjectOwner(projectId, userId);
    const today = new Date();
    const [tasks, milestones, risks] = await Promise.all([
      this.tasks.find({ where: { projectId } }),
      this.milestones.find({ where: { projectId } }),
      this.risks.find({ where: { projectId, resolvedAt: IsNull() } }),
    ]);

    const overdueTasks = tasks.filter(
      (t) => t.status === 'pending' && t.dueDate != null && new Date(t.dueDate) < today,
    );
    const overdueMilestones = milestones.filter(
      (m) => m.status !== 'completed' && m.dueDate != null && new Date(m.dueDate) < today,
    );

    const reasons: string[] = [];
    let score = 0;

    if (overdueTasks.length > 0) {
      score += overdueTasks.length * 2;
      reasons.push(`${overdueTasks.length} 个任务逾期未完成`);
    }
    if (overdueMilestones.length > 0) {
      score += overdueMilestones.length * 3;
      reasons.push(`${overdueMilestones.length} 个里程碑已延期`);
    }
    if (risks.length > 0) {
      score += 2;
      reasons.push(`${risks.length} 条未解决的风险记录`);
    }
    if (project.status === 'active' && !project.endDate) {
      score += 1;
      reasons.push('进行中但未设项目截止日期');
    } else if (project.status === 'on_hold') {
      score += 2;
      reasons.push('项目处于暂停状态');
    } else if (project.status === 'completed') {
      score = 0;
      reasons.length = 0;
    }

    const level = score >= 8 ? 'critical' : score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low';
    return {
      level,
      score,
      reasons,
      dataPoints: {
        taskCount: tasks.length,
        overdueTasks: overdueTasks.length,
        milestoneCount: milestones.length,
        overdueMilestones: overdueMilestones.length,
        openRisks: risks.length,
      },
    };
  }
}
