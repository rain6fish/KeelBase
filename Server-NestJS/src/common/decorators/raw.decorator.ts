// SPDX-License-Identifier: Apache-2.0

import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'raw_response';

/**
 * 标记端点返回裸响应，跳过全局 ResponseInterceptor 的统一包装。
 * 用于需要自定义 body 的端点（如 Prometheus /metrics 的 text/plain 文本）。
 */
export const Raw = () => SetMetadata(RAW_RESPONSE_KEY, true);
