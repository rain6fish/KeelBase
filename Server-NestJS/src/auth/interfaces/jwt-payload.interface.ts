// SPDX-License-Identifier: Apache-2.0

import { UserRole } from '../../common/entities/user.entity';

export interface JwtPayload {
  sub: number;      // user id
  username: string;
  role: UserRole;
  /** Agent Identity（评审二 §5）：access token 的 jti（本次访问令牌会话标识），审计 actor 上下文用 */
  sessionId?: string;
}
