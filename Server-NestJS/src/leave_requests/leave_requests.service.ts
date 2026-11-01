// SPDX-License-Identifier: Apache-2.0

import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { LeaveRequest } from './leave_request.entity';
import { CreateLeaveRequestDto } from './dto/create-leave_request.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave_request.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

/** 列表 `?q=` 匹配的列（spec 的 string / text 字段，按声明顺序）。 */
const LEAVE_REQUEST_SEARCH_COLUMNS = ['requestNo', 'reason'];

@Injectable()
export class LeaveRequestsService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly leave_requestsRepository: Repository<LeaveRequest>,
  ) {}


  async create(dto: CreateLeaveRequestDto, userId: number): Promise<LeaveRequest> {
    const entity = this.leave_requestsRepository.create({
      ...dto,
      // Creation always starts pending, whatever the caller hoped — the DTO no longer accepts a
      // status at all, and this line keeps the invariant true even if that changes.
      // 创建一律从 pending 起步，不论调用方期望什么 —— DTO 已不再接受 status，这一行让不变量在
      // DTO 再变时仍然成立。
      status: 'pending',
      userId,
    });
    return this.leave_requestsRepository.save(entity);
  }

  async findAll(userId: number, q?: string): Promise<LeaveRequest[]> {
    const keyword = q?.trim();
    // Every arm carries the ownership condition, so a hit on any column still stays the caller's
    // own rows.
    // 每条分支各自带归属条件，故任何一列命中都仍限在调用方自己的行内。
    const where = keyword
      ? LEAVE_REQUEST_SEARCH_COLUMNS.map((column) => ({ userId, [column]: Like(`%${keyword}%`) }))
      : { userId };
    return this.leave_requestsRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /** 管理端：全量列表（无 userId 过滤，admin） */
  async findAllForAdmin(): Promise<LeaveRequest[]> {
    return this.leave_requestsRepository.find({ order: { createdAt: 'DESC' } });
  }

  /** 管理端：删除任意（软删进回收站，admin） */
  async removeAsAdmin(id: number): Promise<void> {
    await this.leave_requestsRepository.softDelete(id);
  }

  async findOne(id: number, ability: AppAbility): Promise<LeaveRequest> {
    const entity = await this.leave_requestsRepository.findOne({ where: { id }, });
    if (!entity) throw new NotFoundException('LeaveRequest not found');
    if (ability.cannot('read', subject('LeaveRequest', entity))) {
      throw new ForbiddenException('无权访问此请假申请');
    }
    return entity;
  }

  async update(id: number, dto: UpdateLeaveRequestDto, ability: AppAbility): Promise<LeaveRequest> {
    const entity = await this.findOne(id, ability);
    const { version, ...fields } = dto;
    // Approval is not an owner's edit. Without this, the owner (or any caller who can update the
    // row) could PATCH `status: "approved"` — the same self-approval the create path now refuses.
    // 审批不是本人可做的编辑。没有这一行，本人（或任何能更新该行的人）可以 PATCH
    // `status: "approved"` —— 与创建路径现在拒绝的是同一次自批。
    if (fields.status !== undefined && ability.cannot('manage', 'all')) {
      throw new ForbiddenException('审批状态只能由管理员修改');
    }
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
    const result = await this.leave_requestsRepository.update(
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
    await this.leave_requestsRepository.softDelete(entity.id);
  }
}
