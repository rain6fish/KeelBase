// SPDX-License-Identifier: Apache-2.0

import type { OrderingDeclaration } from '../../governance-shared/services/ordering';

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T | null;
  timestamp: string;
  /**
   * Present only on reads that return ordered rows: which field decided the order, who controls it,
   * what happens on ties, and whether the position is evidence-backed. Absent elsewhere on purpose —
   * a field that is always present stops being read.
   *
   * 只出现在会返回有序行的读上：哪个字段决定了顺序、谁控制它、并列时怎么办、位置是否有证据背书。
   * 其他场合**故意不出现** —— 一个永远存在的字段，最后就没人读了。
   */
  ordering?: OrderingDeclaration;
}
