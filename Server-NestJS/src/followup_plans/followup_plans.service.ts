// SPDX-License-Identifier: Apache-2.0

import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { FollowupPlan } from './followup_plan.entity';
import { CreateFollowupPlanDto } from './dto/create-followup_plan.dto';
import { UpdateFollowupPlanDto } from './dto/update-followup_plan.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 该时刻所在 UTC 日的零点（date-only 入参解析出来就是 UTC 零点，两侧同源）。 */
function utcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/** 该时刻所在自然周（周一起算，按 UTC 日切）的起点与「下周一零点」（排他上界）。 */
function utcWeekOf(at: Date): { start: Date; endExclusive: Date } {
  const day = utcDay(at);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  const start = new Date(day.getTime() - sinceMonday * DAY_MS);
  return { start, endExclusive: new Date(start.getTime() + 7 * DAY_MS) };
}

@Injectable()
export class FollowupPlansService {
  constructor(
    @InjectRepository(FollowupPlan)
    private readonly followup_plansRepository: Repository<FollowupPlan>,
  ) {}


  /**
   * 创建。三条**手写规则**落在这里 —— 它们是 Business Spec 的 `unmapped` 项（薄协议表达不了业务规则，
   * 见 `docs/business-spec.md` §4）：① 必须指向一个客户、② 必须写明计划跟进日（这两条是 Rule 1/2 的前提），
   * ③ Rule 1 同一客户同一周内不重复、④ Rule 2 计划跟进日落在未来 7 天内。生成器不产出它们，故在此手写。
   */
  async create(dto: CreateFollowupPlanDto, userId: number): Promise<FollowupPlan> {
    if (dto.customerId == null) throw new BadRequestException('跟进计划必须指向一个客户');
    if (dto.dueDate == null) throw new BadRequestException('跟进计划必须写明计划跟进日');
    this.assertDueDateInWindow(dto.dueDate);
    await this.assertNoDuplicateInWeek(dto.customerId, dto.dueDate, userId);

    const entity = this.followup_plansRepository.create({
      ...dto,
      userId,
    });
    return this.followup_plansRepository.save(entity);
  }

  /** Rule 2：计划跟进日必须落在未来 7 天内（含今天）。 */
  private assertDueDateInWindow(dueDate: string): void {
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) throw new BadRequestException('计划跟进日不是合法日期');
    const today = utcDay(new Date());
    if (due < today || due.getTime() >= today.getTime() + 8 * DAY_MS) {
      throw new BadRequestException('计划跟进日必须落在未来 7 天内');
    }
  }

  /**
   * Rule 1：同一客户同一周内不重复建立跟进计划。
   *
   * 「同一周」取**计划跟进日**所在的自然周（周一起算）——这条口径是假设，记在
   * `.keelbase/interview/followup-plans.md` Q9。范围按 **owner 收窄**：计划归创建的销售本人所有
   * （见 Business Spec `decisions[]`），故两位销售各为同一客户排计划互不冲突。
   */
  private async assertNoDuplicateInWeek(
    customerId: number,
    dueDate: string,
    userId: number,
  ): Promise<void> {
    const { start, endExclusive } = utcWeekOf(new Date(dueDate));
    const existing = await this.followup_plansRepository.count({
      where: {
        userId,
        customerId,
        dueDate: Between(start, new Date(endExclusive.getTime() - 1)),
      },
    });
    if (existing > 0) throw new ConflictException('本周已为该客户建立过跟进计划');
  }

  async findAll(userId: number): Promise<FollowupPlan[]> {
    return this.followup_plansRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 管理端：全量列表（无 userId 过滤，admin） */
  async findAllForAdmin(): Promise<FollowupPlan[]> {
    return this.followup_plansRepository.find({ order: { createdAt: 'DESC' } });
  }

  /** 管理端：删除任意（软删进回收站，admin） */
  async removeAsAdmin(id: number): Promise<void> {
    await this.followup_plansRepository.softDelete(id);
  }

  async findOne(id: number, ability: AppAbility): Promise<FollowupPlan> {
    const entity = await this.followup_plansRepository.findOne({ where: { id }, });
    if (!entity) throw new NotFoundException('FollowupPlan not found');
    if (ability.cannot('read', subject('FollowupPlan', entity))) {
      throw new ForbiddenException('无权访问此跟进计划');
    }
    return entity;
  }

  async update(id: number, dto: UpdateFollowupPlanDto, ability: AppAbility): Promise<FollowupPlan> {
    const entity = await this.findOne(id, ability);
    const { version, ...fields } = dto;
    // The conditional update is the **only** arbiter: the row is written only while it is still at
    // the version the caller read, so two writers cannot both succeed.
    //
    // Note what is deliberately *not* used: save(). A version column bumps on write but does not
    // guard the write — checked against the SQL the driver actually emits, the UPDATE carries no
    // version predicate — so a stale save silently overwrites. Zero rows affected is the conflict.
    //
    // 条件更新是**唯一**仲裁点：只有当行仍停在调用方读到的那个版本时才写入，故两个写入者不可能都成功。
    //
    // 这里刻意**不用** save()：版本列会在写入时自增，却不为写入设防 —— 按驱动实发的 SQL 核过，
    // 那条 UPDATE 里没有版本判据 —— 于是一次陈旧的保存就是无声覆盖。「影响 0 行」即冲突。
    const result = await this.followup_plansRepository.update(
      { id: entity.id, version },
      { ...fields, version: () => 'version + 1' },
    );
    if (!result.affected) {
      throw new ConflictException('该记录已被他人修改，请刷新后重试');
    }
    return this.findOne(id, ability);
  }

  async remove(id: number, ability: AppAbility): Promise<void> {
    const entity = await this.findOne(id, ability);
    // RG-3 软删除：置 deleted_at，管理台回收站可恢复
    await this.followup_plansRepository.softDelete(entity.id);
  }
}
