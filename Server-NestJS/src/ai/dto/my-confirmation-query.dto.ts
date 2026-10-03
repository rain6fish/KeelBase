// SPDX-License-Identifier: Apache-2.0

/**
 * GA Action Center (docs/ai-action-center.spec.md §9) list filter.
 *
 * The allowed statuses come from the single source `CONFIRMATION_STATUS` (confirmation.store.ts).
 * The controller used to carry its own copy of that array and to ignore an unknown value silently,
 * falling back to "return everything" — the "never silently widen" rule in data-scope.spec.md.
 * Like the sibling `ai/audit/dto/audit-query.dto.ts`, an unknown value is refused here.
 *
 * GA 待我确认中心（docs/ai-action-center.spec.md §9）的列表过滤。
 *
 * `status` 的取值域取自确认生命周期的单一源 `CONFIRMATION_STATUS`（confirmation.store.ts）。
 * 原先 controller 手抄了同一份数组，且遇到未知值会**静默忽略**、退回「返回全部」
 * —— 即 data-scope.spec.md 的 never silently widen。这里与同仓兄弟
 * `ai/audit/dto/audit-query.dto.ts` 同做法：未知值直接拒绝。
 */

import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CONFIRMATION_STATUS } from '../confirmation/confirmation.store';
import type { ConfirmationStatus } from '../confirmation/confirmation.store';

const ALLOWED_STATUSES = Object.values(CONFIRMATION_STATUS);

export class MyConfirmationQueryDto {
  @ApiPropertyOptional({ description: '按确认状态过滤', enum: ALLOWED_STATUSES })
  @IsOptional()
  @IsIn(ALLOWED_STATUSES)
  status?: ConfirmationStatus;
}
