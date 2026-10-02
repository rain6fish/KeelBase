// SPDX-License-Identifier: Apache-2.0

import { User } from '../common/entities/user.entity';
import { maskEmail, maskPhone } from '../common/utils/mask';

/**
 * The admin console's view of a user — one implementation, shared by every admin read path, and
 * an **allowlist** rather than a denylist.
 *
 * The rule this encodes (CLAUDE.md §5.5, red line 2): the admin console shows no personal data
 * the user typed. Identifiers survive so rows can be told apart; addresses appear masked; the
 * private profile fields are not returned at all. It is a **privacy** view rather than a
 * credential view, so secret material is withheld too. `password` and `mfaSecret` are hidden by
 * their columns' `select: false`; everything else is withheld by not being named below.
 *
 * Naming what survives, rather than deleting what must not, is the point: this used to be a
 * denylist, and a denylist leaks whatever column is added next — which is exactly how the phone
 * hash and the live email verification code reached admin callers. A new column is now invisible
 * here until someone adds it on purpose, and `user-admin-view.spec.ts` locks the key set so that
 * decision cannot be made by accident.
 *
 * 管理端看到的用户视图 —— **单一实现**，所有管理端读路径共用；它是**白名单**而不是黑名单。
 *
 * 它编码的规则（CLAUDE.md §5.5 红线 2）：管理台不出现用户填写的个人数据。标识保留以便区分行；地址以
 * 掩码出现；私人资料字段根本不返回。它是**隐私视图**而非**凭证视图**，故秘密材料同样扣下。`password`
 * 与 `mfaSecret` 由列上的 `select: false` 挡住；其余靠「下面不点名」扣下。
 *
 * **点名保留什么、而不是删除不许什么，正是要点**：这里原本是黑名单，而黑名单会漏掉**下一个新增的列** ——
 * 手机号哈希与实时邮箱验证码正是这样到达管理端调用方的。现在新增一列在这里默认不可见，直到有人刻意加进来；
 * 而 `user-admin-view.spec.ts` 锁住键集，使这个决定无法被顺手做出。
 */
const ADMIN_USER_FIELDS = [
  'id',
  'username',
  'email',
  'nickname',
  'phone',
  'phoneVerified',
  'role',
  'emailVerified',
  'mfaEnabled',
  'mustChangePassword',
  'inviteCode',
  'invitedBy',
  'createdAt',
  'updatedAt',
] as const;

export function sanitizeUserForAdmin(
  user: User,
  decryptPhone: (stored: string) => string,
): Partial<User> {
  const src = user as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ADMIN_USER_FIELDS) {
    // 这两列要变换，单独处理：整份拷贝会把明文/密文直接带出去
    if (key === 'email' || key === 'phone') continue;
    if (src[key] !== undefined) out[key] = src[key];
  }
  out.email = maskEmail(user.email);
  // 与旧实现逐字一致：没有该列 ⇒ 不出现该键；有但为空 ⇒ 原样（null）；有值 ⇒ 掩码。
  // Byte-for-byte the old behaviour: absent stays absent, present-but-empty stays as it is, a
  // stored number is masked.
  if (src.phone !== undefined) {
    out.phone = user.phone ? maskPhone(decryptPhone(user.phone)) : src.phone;
  }
  return out as Partial<User>;
}
