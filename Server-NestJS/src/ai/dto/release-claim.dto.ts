// SPDX-License-Identifier: Apache-2.0

import { IsDefined, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength, ValidateNested, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WRITE_CLAIM_DECISION_STATE } from '../../governance-shared/entities/ai-write-claim.entity';
// Type-only: it decorates a plain property (no DI token behind it), and `isolatedModules` +
// `emitDecoratorMetadata` require a type import for a type used in a decorated signature.
// 仅类型导入：它标注的是普通属性（背后没有 DI 令牌），而 `isolatedModules` + `emitDecoratorMetadata`
// 要求「出现在被装饰签名里的类型」用类型导入。
import type { WriteClaimDecisionState } from '../../governance-shared/entities/ai-write-claim.entity';

/**
 * R-4: what the review screen showed when it was opened — the facts a release is bound to.
 *
 * Without it the endpoint is keyed to the claim id and the note alone, so a sweep moving the row
 * underneath the screen (and the conditional update accepting both `open` and `awaiting_decision`)
 * lets the release succeed against a state nobody saw. The view is **required**, not optional: an
 * absent view would silently mean "do not check", and the released row could not say whether it was
 * bound to anything. Both fields are the read surface's own values (`GET /ai/tool-effects/claims`:
 * `decisionState` and `lastLookup.id`), compared against the ledger when the release arrives.
 *
 * `lastLookupId` must be **present** and may be `null`: `null` is the screen's statement that nobody
 * had asked yet, which is a reading, not a missing value.
 *
 * R-4：复核屏幕打开时看到的事实 —— 释放所绑定的一切。
 *
 * 没有它，端点只绑 claim id 与备注；于是清扫把行在屏幕下面移走（条件更新又同时接受 `open` 与
 * `awaiting_decision`）时，释放会针对一个没人见过的状态成功。视图是**必填**、不是可选：缺席的视图会
 * 静默地等于「不检查」，而释放行也就说不清它绑过什么。两个字段都取读面自己给的值
 *（`GET /ai/tool-effects/claims` 的 `decisionState` 与 `lastLookup.id`），在释放到达时与账本比对。
 *
 * `lastLookupId` 必须**给出**、可以是 `null`：`null` 是屏幕在说「当时还没人问过」，那是一条读数，
 * 不是一个缺值。
 */
export class ReleaseClaimViewDto {
  @ApiProperty({
    description: '打开复核屏幕时账本所处的治理处置（读面 decisionState）',
    enum: Object.values(WRITE_CLAIM_DECISION_STATE),
  })
  @IsIn(Object.values(WRITE_CLAIM_DECISION_STATE))
  decisionState!: WriteClaimDecisionState;

  @ApiProperty({
    description: '打开复核屏幕时最近一次目标状态读数的 id；当时没有读数为 null（必须显式给出）',
    nullable: true,
    type: Number,
  })
  // Present-but-nullable: a missing key fails `@IsInt`, an explicit `null` skips it.
  // 必须出现但可为 null：键缺失会被 `@IsInt` 拒，显式 `null` 则跳过校验。
  @ValidateIf((_o, value) => value !== null)
  @IsInt()
  lastLookupId!: number | null;
}

/**
 * AW-16 F-63: the evidence a release must carry.
 *
 * A note is mandatory — a release that says nothing about why it was made is indistinguishable from
 * someone making the queue go away. `evidenceRef` is optional and names whatever the person actually
 * consulted (a ticket, a target-status lookup, a log line); it is recorded verbatim on the audit row,
 * never interpreted here. `view` (R-4) is the screen's frozen reading — see `ReleaseClaimViewDto`.
 *
 * AW-16 F-63：释放必须附带的证据。
 *
 * 说明必填 —— 一条不说为什么的释放，与「把队列点没了」无法区分。`evidenceRef` 可选，写的是这个人
 * 实际查过什么（工单、目标状态查询、日志行）；它原样记进审计行，这里不做解释。`view`（R-4）是屏幕
 * 冻结的读数 —— 见 `ReleaseClaimViewDto`。
 */
export class ReleaseClaimDto {
  @ApiProperty({
    description: '为何释放（必填，原样记入审计行）',
    minLength: 8,
    maxLength: 500,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  note!: string;

  @ApiPropertyOptional({
    description: '可选外部引用：工单号 / 对账记录 id / 日志地址（原样记入审计行）',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  evidenceRef?: string;

  @ApiProperty({
    description: 'R-4：打开复核屏幕时冻结的读数（释放据此与账本比对，不一致则拒绝）',
    type: ReleaseClaimViewDto,
  })
  // `@IsDefined` is what makes the view **required**: `@ValidateNested` alone skips an absent value,
  // and an absent view would then reach the service as `undefined` — the silent "do not check" this
  // whole item exists to remove.
  // `@IsDefined` 才是「必填」：单靠 `@ValidateNested` 会跳过缺席值，缺席的视图会以 `undefined` 抵达
  // 服务 —— 正是本条要消掉的「静默不检查」。
  @IsDefined()
  @ValidateNested()
  @Type(() => ReleaseClaimViewDto)
  view!: ReleaseClaimViewDto;
}
