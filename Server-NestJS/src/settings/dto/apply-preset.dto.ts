// SPDX-License-Identifier: Apache-2.0

import { IsIn } from 'class-validator';

export class ApplyPresetDto {
  /** 首启预设：full（全开默认）/ small（关外部集成）/ lite（最小可用） */
  @IsIn(['full', 'small', 'lite'])
  preset!: 'full' | 'small' | 'lite';
}
