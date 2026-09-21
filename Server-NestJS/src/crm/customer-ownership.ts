// SPDX-License-Identifier: Apache-2.0

/**
 * 客户归属校验（阶段 3 第十三刀：从 `CrmService._assertCustomerOwner` 提为具名函数）。
 *
 * 它是**安全谓词**：查询同时限定 `id` 与 `userId`，查不到即 404——**不区分「不存在」与「不属于你」**，
 * 避免用状态码枚举他人客户。CRM 里凡是按客户 id 取子资源的路径都要过它（CRUD 侧十余处、分析侧一处）。
 *
 * **复制一份就会让两条路径的判据悄悄分叉**，故提为单一来源：谁要用谁调用，规则只有这一处。
 */
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CrmCustomer } from './crm-customer.entity';

export async function assertCustomerOwner(
  customers: Repository<CrmCustomer>,
  customerId: number,
  userId: number,
): Promise<CrmCustomer> {
  const customer = await customers.findOne({ where: { id: customerId, userId } });
  if (!customer) throw new NotFoundException('客户不存在或无权访问');
  return customer;
}
