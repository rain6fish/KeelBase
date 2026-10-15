// SPDX-License-Identifier: Apache-2.0

import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Not, Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { AssetLoan } from './asset_loan.entity';
import { CreateAssetLoanDto } from './dto/create-asset_loan.dto';
import { UpdateAssetLoanDto } from './dto/update-asset_loan.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

/** 列表 `?q=` 匹配的列（spec 的 string / text 字段，按声明顺序）。 */
const ASSET_LOAN_SEARCH_COLUMNS = ['assetName', 'assetTag', 'purpose'];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Midnight of the UTC day an instant falls in — a date-only input parses to UTC midnight, so both
 * sides agree without a timezone.
 *
 * 该时刻所在 UTC 日的零点 —— date-only 入参解析出来就是 UTC 零点，两侧无需时区即可对齐。
 */
function utcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

@Injectable()
export class AssetLoansService {
  constructor(
    @InjectRepository(AssetLoan)
    private readonly asset_loansRepository: Repository<AssetLoan>,
  ) {}


  /**
   * Create. Two **hand-written rules** live here — they are the Business Spec's `unmapped` items (a
   * thin protocol carries shape, not rules; see `docs/business-spec.md` §4): Rule 1 refuses a second
   * loan of an asset that is still out, and Rule 2 keeps the due date inside a 30-day window. Rule 2
   * needs the due date to exist at all (otherwise "due and managed" has nothing to be due), so a
   * missing due date is refused first. The generator emits none of this — it is written by hand here.
   *
   * 创建。两条**手写规则**落在这里 —— 它们是 Business Spec 的 `unmapped` 项（薄协议承载形状、不承载
   * 规则，见 `docs/business-spec.md` §4）：规则 1 拒绝为一台仍未归还的设备再登记第二条借用；规则 2 把
   * 计划归还日圈在 30 天窗口内。规则 2 先要求归还日存在（否则「到期可管」无从谈起），故缺归还日先拒。
   * 生成器不产出这些，是在此手写的。
   */
  async create(dto: CreateAssetLoanDto, userId: number): Promise<AssetLoan> {
    if (dto.dueDate == null) throw new BadRequestException('借用登记必须写明计划归还日');
    this.assertDueDateInWindow(dto.dueDate);
    await this.assertAssetFree(dto.assetTag);

    const entity = this.asset_loansRepository.create({
      ...dto,
      userId,
    });
    return this.asset_loansRepository.save(entity);
  }

  /** Rule 2: the due date must fall within the next 30 days (today included). */
  /** 规则 2：计划归还日必须落在未来 30 天内（含今天）。 */
  private assertDueDateInWindow(dueDate: string | Date): void {
    const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
    if (Number.isNaN(due.getTime())) throw new BadRequestException('计划归还日不是合法日期');
    const today = utcDay(new Date());
    if (due.getTime() < today.getTime() || due.getTime() >= today.getTime() + 31 * DAY_MS) {
      throw new BadRequestException('计划归还日必须落在未来 30 天内');
    }
  }

  /**
   * Rule 1: an asset that is still out cannot be loaned again. The anchor is **assetTag** (the name
   * is not unique — same-model devices exist); "still out" means `status != 'returned'` (active or
   * overdue). The scope is the **whole table**, not the caller's own rows: the device is a shared
   * physical asset, and two people holding the same one at once is exactly what this rule exists to
   * prevent. Soft-deleted rows do not count (TypeORM filters `deleted_at` by default).
   *
   * 规则 1：仍未归还的设备不能再借。锚点是 **assetTag**（名称不唯一 —— 同型号设备可能多台）；「未归还」
   * 指 `status != 'returned'`（active 或 overdue）。范围是**全表**而非调用方自己的行：设备是共享实物，
   * 两个人同时占着同一台正是这条规则要挡的。软删的行不算（TypeORM 默认过滤 `deleted_at`）。
   */
  private async assertAssetFree(assetTag: string): Promise<void> {
    const active = await this.asset_loansRepository.count({
      where: { assetTag, status: Not('returned') },
    });
    if (active > 0) throw new ConflictException('该资产编号仍有未归还的借用记录，不能重复登记');
  }

  async findAll(userId: number, q?: string): Promise<AssetLoan[]> {
    const keyword = q?.trim();
    // Every arm carries the ownership condition, so a hit on any column still stays the caller's
    // own rows.
    // 每条分支各自带归属条件，故任何一列命中都仍限在调用方自己的行内。
    const where = keyword
      ? ASSET_LOAN_SEARCH_COLUMNS.map((column) => ({ userId, [column]: Like(`%${keyword}%`) }))
      : { userId };
    return this.asset_loansRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /** 管理端：全量列表（无 userId 过滤，admin） */
  async findAllForAdmin(): Promise<AssetLoan[]> {
    return this.asset_loansRepository.find({ order: { createdAt: 'DESC' } });
  }

  /** 管理端：删除任意（软删进回收站，admin） */
  async removeAsAdmin(id: number): Promise<void> {
    await this.asset_loansRepository.softDelete(id);
  }

  async findOne(id: number, ability: AppAbility): Promise<AssetLoan> {
    const entity = await this.asset_loansRepository.findOne({ where: { id }, });
    if (!entity) throw new NotFoundException('AssetLoan not found');
    if (ability.cannot('read', subject('AssetLoan', entity))) {
      throw new ForbiddenException('无权访问此资产借用');
    }
    return entity;
  }

  async update(id: number, dto: UpdateAssetLoanDto, ability: AppAbility): Promise<AssetLoan> {
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
    const result = await this.asset_loansRepository.update(
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
    await this.asset_loansRepository.softDelete(entity.id);
  }
}
