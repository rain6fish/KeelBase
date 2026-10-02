// SPDX-License-Identifier: Apache-2.0

import { getMetadataArgsStorage } from 'typeorm';
import { User } from '../common/entities/user.entity';
import { sanitizeUserForAdmin } from './user-admin-view';
import { maskEmail, maskPhone } from '../common/utils/mask';

/**
 * Locks the admin user view: which fields it may show, which it must withhold, and — the part
 * that keeps the class from coming back — that every column on `User` is one or the other.
 *
 * The view used to be a denylist, so a column added later leaked by default; the phone hash and
 * the live email verification code did exactly that. The last case below turns "add a column" into
 * a decision: it fails until the new column is put in the allowlist or in the withheld list.
 *
 * 锁住管理端用户视图：可以显示哪些字段、必须扣下哪些，以及 —— 让这一整类不再复发的那一条 ——
 * `User` 上的每一列都必须是这两者之一。该视图原本是黑名单，于是后来新增的列默认泄漏；手机号哈希与
 * 实时邮箱验证码正是如此。最后一例把「加一列」变成一次决定：新列不被放进放行表或扣下表，测试就是红的。
 */
describe('sanitizeUserForAdmin（管理端用户视图）', () => {
  const decrypt = (stored: string) => (stored.startsWith('enc:') ? stored.slice(4) : stored);

  const fullUser = {
    id: 7,
    username: 'acme_admin',
    email: 'alice@example.com',
    nickname: 'Alice',
    phone: 'enc:13800138000',
    phoneVerified: true,
    role: 'user',
    emailVerified: true,
    mfaEnabled: true,
    mustChangePassword: false,
    inviteCode: 'INV-7',
    invitedBy: 3,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    // 以下都是「有意扣下」的：私人资料、凭证材料、内部计数
    password: 'hash',
    mfaSecret: 'seed',
    bio: '私密简介',
    dateOfBirth: '1990-01-01',
    firstName: '张',
    lastName: '三',
    avatarUrl: 'https://example.com/a.png',
    provider: 'wechat',
    providerId: 'openid-1',
    providerHash: 'ph',
    phoneHash: 'hmac:13800138000',
    resetTokenHash: 'reset-hash',
    resetTokenExpiresAt: new Date(),
    emailVerificationCode: '123456',
    emailVerificationExpiresAt: new Date(),
    loginAttempts: 2,
    lockedUntil: null,
  } as unknown as User;

  it('放行的字段就是这一组（键集被锁住：增删都要改这里，等于一次决定）', () => {
    const view = sanitizeUserForAdmin(fullUser, decrypt);

    expect(Object.keys(view).sort()).toEqual(
      [
        'createdAt',
        'email',
        'emailVerified',
        'id',
        'inviteCode',
        'invitedBy',
        'mfaEnabled',
        'mustChangePassword',
        'nickname',
        'phone',
        'phoneVerified',
        'role',
        'updatedAt',
        'username',
      ].sort(),
    );
  });

  it('凭证材料与私人资料一律不出现，且地址只有掩码', () => {
    const view = sanitizeUserForAdmin(fullUser, decrypt) as Record<string, unknown>;

    for (const withheld of [
      'password',
      'mfaSecret',
      'phoneHash',
      'resetTokenHash',
      'resetTokenExpiresAt',
      'emailVerificationCode',
      'emailVerificationExpiresAt',
      'bio',
      'dateOfBirth',
      'firstName',
      'lastName',
      'avatarUrl',
      'provider',
      'providerId',
      'providerHash',
      'loginAttempts',
      'lockedUntil',
    ]) {
      expect(view[withheld]).toBeUndefined();
    }
    expect(view.email).toBe(maskEmail('alice@example.com'));
    expect(view.phone).toBe(maskPhone('13800138000'));
  });

  it('没有手机号时 phone 为 null（不是空串、也不是密文）', () => {
    const view = sanitizeUserForAdmin({ ...fullUser, phone: null } as unknown as User, decrypt);
    expect(view.phone).toBeNull();
  });

  it('User 的每一列都必须显式二选一：放行，或有意扣下 —— 新列不加进来，这一例就是红的', () => {
    const columns = getMetadataArgsStorage()
      .columns.filter((c) => c.target === User)
      .map((c) => c.propertyName);

    // 本测试文件顶部那份夹具就是「有意扣下」的清单；两侧并起来必须覆盖实体的每一列。
    const allowed = Object.keys(sanitizeUserForAdmin(fullUser, decrypt));
    const withheld = Object.keys(fullUser).filter((k) => !allowed.includes(k));
    const undecided = columns.filter((c) => !allowed.includes(c) && !withheld.includes(c));

    expect(undecided).toEqual([]);
    // 反向也要成立：清单里的名字不该是实体上不存在的幽灵
    expect(allowed.filter((k) => !columns.includes(k))).toEqual([]);
  });
});
