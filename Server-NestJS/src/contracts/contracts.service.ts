// SPDX-License-Identifier: Apache-2.0

import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { Contract } from './contract.entity';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

/** 列表 `?q=` 匹配的列（spec 的 string / text 字段，按声明顺序）。 */
const CONTRACT_SEARCH_COLUMNS = ['name', 'counterparty'];

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(Contract)
    private readonly contractsRepository: Repository<Contract>,
  ) {}


  async create(dto: CreateContractDto, userId: number): Promise<Contract> {
    const entity = this.contractsRepository.create({
      ...dto,
      userId,
    });
    return this.contractsRepository.save(entity);
  }

  async findAll(userId: number, q?: string): Promise<Contract[]> {
    const keyword = q?.trim();
    // Every arm carries the ownership condition, so a hit on any column still stays the caller's
    // own rows.
    // 每条分支各自带归属条件，故任何一列命中都仍限在调用方自己的行内。
    const where = keyword
      ? CONTRACT_SEARCH_COLUMNS.map((column) => ({ userId, [column]: Like(`%${keyword}%`) }))
      : { userId };
    return this.contractsRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /** 管理端：全量列表（无 userId 过滤，admin） */
  async findAllForAdmin(): Promise<Contract[]> {
    return this.contractsRepository.find({ order: { createdAt: 'DESC' } });
  }

  /** 管理端：删除任意（软删进回收站，admin） */
  async removeAsAdmin(id: number): Promise<void> {
    await this.contractsRepository.softDelete(id);
  }

  async findOne(id: number, ability: AppAbility): Promise<Contract> {
    const entity = await this.contractsRepository.findOne({ where: { id }, });
    if (!entity) throw new NotFoundException('Contract not found');
    if (ability.cannot('read', subject('Contract', entity))) {
      throw new ForbiddenException('无权访问此合同');
    }
    return entity;
  }

  async update(id: number, dto: UpdateContractDto, ability: AppAbility): Promise<Contract> {
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
    const result = await this.contractsRepository.update(
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
    await this.contractsRepository.softDelete(entity.id);
  }
}
