// SPDX-License-Identifier: Apache-2.0

import { Injectable, NotFoundException, ForbiddenException, ConflictException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { Report } from './report.entity';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';
import { OrgService } from '../org/org.service';
import { DataScopeService } from '../authz/data-scope.service';
import { assertCallerIdentity, orgContextOf, resolveScopeDescriptor } from '../common/scope/scope-resolution';
import { buildScopeWhere, registerScopeColumns, rowInScope } from '../common/scope/scope-where';
import { registerOrgLevelSubject } from '../common/scope/scope-policy';


// 协议 scope 声明 → 本模块参与行级数据范围：登记自己的列，并按缺省走「本人或同组织」。
// 列名固定（与生成实体一致）；未声明 scope 的模块不登记，也就仍是仅本人 —— 绝不静默放宽。
// Protocol scope declaration → this module takes part in row-level data scope: it registers its
// own columns and defaults to "own or same organisation". Undeclared modules stay owner-only.
registerScopeColumns('Report', { owner: 'userId', org: 'orgId' });
registerOrgLevelSubject('Report');

/** 列表 `?q=` 匹配的列（spec 的 string / text 字段，按声明顺序）。 */
const REPORT_SEARCH_COLUMNS = ['title', 'summary'];

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private readonly reportsRepository: Repository<Report>,
    @Optional() private readonly orgService?: OrgService,
    @Optional() private readonly dataScope?: DataScopeService,
  ) {}

  /**
   * The caller's data scope for this subject: role configuration when present, the built-in default
   * otherwise. Missing configuration only ever tightens — see `common/scope`.
   *
   * 调用方在本 subject 上的数据范围：有角色配置用它、否则用内置默认。配置缺失只会收紧 —— 见
   * `common/scope`。
   */
  private async _scopeFor(userId: number) {
    return resolveScopeDescriptor(userId, 'Report', this.orgService, this.dataScope);
  }

  /**
   * Whether this caller may read or manage this row: its own, or same-organisation. Kept in step with
   * the list query so a row that shows up in the list is never refused on the detail path.
   *
   * 该调用方能否读/管理这一行：本人的，或同组织的。与列表查询保持同一口径，故**列表里看得见的行，
   * 明细路径上不会反被拒**。
   */
  private async _canAccess(row: Report, ability: AppAbility, userId: number): Promise<boolean> {
    if (ability.can('manage', 'all')) return true;
    if (ability.can('read', subject('Report', row))) return true;
    return rowInScope(row as unknown as Record<string, unknown>, await this._scopeFor(userId), 'Report');
  }


  async create(dto: CreateReportDto, userId: number): Promise<Report> {
    // Stamped from the creator's membership: a member's rows are visible to their organisation,
    // a non-member's stay owner-only. A missing org never widens anything.
    // 按创建者的组织归属盖章：成员的行对其组织可见，非成员的行保持仅本人。组织信息缺失绝不放宽。
    const orgContext = await orgContextOf(this.orgService, userId);
    const entity = this.reportsRepository.create({
      ...dto,
      userId,
      orgId: orgContext?.orgId ?? undefined,
    });
    return this.reportsRepository.save(entity);
  }

  async findAll(userId: number, q?: string): Promise<Report[]> {
    assertCallerIdentity(userId, '读取报告列表');
    const descriptor = await this._scopeFor(userId);
    const scoped = (buildScopeWhere<Record<string, unknown>>(descriptor, 'Report') ?? []) as any;
    const keyword = q?.trim();
    // Search arms are built *from* the scope arms, never instead of them: a hit on any column still
    // cannot escape the caller's scope. An empty list is the level-`all` shape (no row-level
    // constraint), and the filter applies there too.
    // 搜索分支是**从**范围分支长出来的，不是替换它：任何一列命中都逃不出调用方范围。列表为空即
    // level-`all` 的形状（无行级约束），在那里过滤同样生效。
    const where = keyword
      ? (scoped.length > 0 ? scoped : [{}]).flatMap((arm: Record<string, unknown>) =>
          REPORT_SEARCH_COLUMNS.map((column) => ({ ...arm, [column]: Like(`%${keyword}%`) })),
        )
      : scoped;
    return this.reportsRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /** 管理端：全量列表（无 userId 过滤，admin） */
  async findAllForAdmin(): Promise<Report[]> {
    return this.reportsRepository.find({ order: { createdAt: 'DESC' } });
  }

  /** 管理端：删除任意（软删进回收站，admin） */
  async removeAsAdmin(id: number): Promise<void> {
    await this.reportsRepository.softDelete(id);
  }

  async findOne(id: number, ability: AppAbility, userId: number): Promise<Report> {
    assertCallerIdentity(userId, '读取报告');
    const entity = await this.reportsRepository.findOne({ where: { id }, });
    if (!entity) throw new NotFoundException('Report not found');
    if (!(await this._canAccess(entity, ability, userId))) {
      throw new ForbiddenException('无权访问此报告');
    }
    return entity;
  }

  async update(id: number, dto: UpdateReportDto, ability: AppAbility, userId: number): Promise<Report> {
    const entity = await this.findOne(id, ability, userId);
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
    const result = await this.reportsRepository.update(
      { id: entity.id, version },
      { ...fields, version: () => 'version + 1' },
    );
    if (!result.affected) {
      throw new ConflictException('该记录已被他人修改，请刷新后重试');
    }
    return this.findOne(id, ability, userId);
  }

  async remove(id: number, ability: AppAbility, userId: number): Promise<void> {
    const entity = await this.findOne(id, ability, userId);
    // RG-3 软删除：置 deleted_at，管理台回收站可恢复
    await this.reportsRepository.softDelete(entity.id);
  }
}
