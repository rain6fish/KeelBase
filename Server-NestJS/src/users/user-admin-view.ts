// SPDX-License-Identifier: Apache-2.0

import { User } from '../common/entities/user.entity';
import { maskEmail, maskPhone } from '../common/utils/mask';

/**
 * The admin console's view of a user — one implementation, shared by every admin read path.
 *
 * The rule this encodes (CLAUDE.md §5.5, red line 2): the admin console shows no personal data
 * the user typed. Identifiers survive so rows can be told apart; addresses appear masked; the
 * private profile fields are not returned at all. It is a **privacy** view rather than a
 * credential view, so it also withholds secret material: the reset-token hash, the live email
 * verification code, and the phone's HMAC (a stable pseudonymous identifier behind a masked
 * field). `password` and `mfaSecret` are hidden by their columns' `select: false`; every other
 * secret has to be named here, because the queries select all remaining columns.
 *
 * Two admin paths used to implement this separately and drifted apart — the users service and
 * the admin detail endpoint — which is why it lives in one place now.
 *
 * 管理端看到的用户视图 —— **单一实现**，所有管理端读路径共用。
 * 它编码的规则（CLAUDE.md §5.5 红线 2）：管理台不出现用户填写的个人数据。标识保留以便区分行；
 * 地址以掩码出现；私人资料字段根本不返回。它是**隐私视图**而非**凭证视图**，故一并扣下秘密材料：
 * 重置令牌哈希、实时的邮箱验证码，以及手机号的 HMAC（掩码字段背后的稳定假名标识）。`password` 与
 * `mfaSecret` 由列上的 `select: false` 挡住；其余秘密必须在这里点名，因为查询取走了剩下的全部列。
 *
 * 管理端的两条路径过去各写一遍、并因此漂移（users service 与管理端详情端点），所以现在只有一处。
 */
export function sanitizeUserForAdmin(
  user: User,
  decryptPhone: (stored: string) => string,
): Partial<User> {
  const rest = { ...user } as Record<string, unknown>;
  delete rest.password;
  delete rest.loginAttempts;
  delete rest.lockedUntil;
  delete rest.bio;
  delete rest.dateOfBirth;
  delete rest.firstName;
  delete rest.lastName;
  delete rest.avatarUrl;
  delete rest.provider;
  delete rest.providerId;
  delete rest.providerHash;
  delete rest.resetTokenHash;
  delete rest.resetTokenExpiresAt;
  delete rest.emailVerificationCode;
  delete rest.emailVerificationExpiresAt;
  delete rest.phoneHash;
  rest.email = maskEmail(user.email);
  if (user.phone) rest.phone = maskPhone(decryptPhone(user.phone));
  return rest as Partial<User>;
}
