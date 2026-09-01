// SPDX-License-Identifier: Apache-2.0

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T | null;
  timestamp: string;
}
