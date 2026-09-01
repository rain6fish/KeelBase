// SPDX-License-Identifier: Apache-2.0

import { SetMetadata } from '@nestjs/common';

export const SKIP_AUDIT_KEY = 'skip_operation_audit';

/**
 * 标记端点不记录操作审计（如已被其他审计覆盖、或纯幂等内部操作）。
 */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);
