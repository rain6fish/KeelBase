// SPDX-License-Identifier: Apache-2.0

import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Min, ValidateIf } from 'class-validator';
import { CreateLeaveRequestDto } from './create-leave_request.dto';

export class UpdateLeaveRequestDto extends PartialType(CreateLeaveRequestDto) {
  /**
   * The approval state. Accepted here (not on create) so an administrator can approve or reject;
   * the service refuses the change for anyone else — otherwise a requester approves their own row.
   *
   * 审批状态。在更新（而非创建）时可传，供管理员批准或驳回；服务端对其他人一律拒绝 ——
   * 否则申请人就能给自己批。
   */
  @ApiPropertyOptional({ description: 'status', enum: ['pending', 'approved', 'rejected'] })
  @IsString()
  // `@IsOptional()` skips every other validator for `null` as well as `undefined`, so `{status: null}`
  // passed the enum check and an administrator could write NULL into the column. Skip only when the
  // field is absent — an explicit null is a value, and it is not one of the three states.
  // `@IsOptional()` 对 `null` 与 `undefined` 都跳过其余校验器，于是 `{status: null}` 绕过了枚举，
  // 管理员可以把 NULL 写进该列。只在字段**缺席**时跳过 —— 显式 null 是一个值，且不是那三个状态之一。
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['pending', 'approved', 'rejected'])
  status?: string;

  /**
   * The version the caller read. Required, and that is the point: were it optional an update could
   * omit it, the check would run against the row the service just loaded, and it would pass every
   * time — protecting no one while looking like it protects.
   *
   * 调用方读到的版本号，**必填**；必填正是要点：若可选，调用方就能不传，校验会拿服务刚读到的
   * 那一行去比 —— 每次都通过，看着像在保护，其实谁也保护不了。
   */
  @IsInt()
  @Min(1)
  version!: number;
}
