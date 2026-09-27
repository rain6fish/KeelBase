// SPDX-License-Identifier: Apache-2.0

import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { FollowupPlan } from './followup_plan.entity';
import { CreateFollowupPlanDto } from './dto/create-followup_plan.dto';
import { UpdateFollowupPlanDto } from './dto/update-followup_plan.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@Injectable()
export class FollowupPlansService {
  constructor(
    @InjectRepository(FollowupPlan)
    private readonly followup_plansRepository: Repository<FollowupPlan>,
  ) {}


  async create(dto: CreateFollowupPlanDto, userId: number): Promise<FollowupPlan> {
    const entity = this.followup_plansRepository.create({
      ...dto,
      userId,
    });
    return this.followup_plansRepository.save(entity);
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
