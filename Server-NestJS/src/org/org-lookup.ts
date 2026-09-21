// SPDX-License-Identifier: Apache-2.0

/**
 * 组织存在性校验（阶段 3 第十五刀：从 `OrgService._ensureOrg` 提为具名函数）。
 *
 * 按 id 取组织、取不到即 404。**它是写入与读取路径共同的前置**——组织/部门/成员/邀请的十余处操作、
 * 以及通讯录读取都要过它。复制一份就会让两条路径的判据悄悄分叉，故提为单一来源：谁要用谁调用。
 */
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Organization } from './organization.entity';

export async function ensureOrg(
  orgsRepo: Repository<Organization>,
  id: number,
): Promise<Organization> {
  const org = await orgsRepo.findOne({ where: { id } });
  if (!org) throw new NotFoundException('组织不存在');
  return org;
}
