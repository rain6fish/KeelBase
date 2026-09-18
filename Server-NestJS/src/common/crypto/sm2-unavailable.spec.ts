// SPDX-License-Identifier: Apache-2.0

/**
 * SM2 缺库不静默（私库《D4 触发执行包》§6.4 红线）：宿主无 openssl 时，签名 / 验签 / 公钥推导
 * 一律抛 `Sm2UnavailableError` —— 绝不返回 false、绝不产出「无 sm2 段」的包冒充已签名。
 *
 * 独立成文件：需整模块 mock `node:child_process`，而 `execFileSync` 是只读属性不可 spyOn，
 * 与 sm2.spec.ts（需真实 openssl）不能共处一个模块注册表。
 */
jest.mock('node:child_process', () => ({
  execFileSync: jest.fn(() => {
    throw Object.assign(new Error('spawn openssl ENOENT'), { code: 'ENOENT' });
  }),
}));

import { Sm2UnavailableError, derivePublicKeyHex, signCanonical, verifyCanonical } from './sm2';

const PEM = '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----';

describe('SM2 缺库不静默（执行包 §6.4）', () => {
  it('openssl 缺失：验签抛错，而不是静默判 false', () => {
    expect(() => verifyCanonical('{}', `04${'ab'.repeat(64)}`, 'ab'.repeat(64))).toThrow(Sm2UnavailableError);
  });

  it('openssl 缺失：签名抛错，而不是产出无 sm2 段的包', () => {
    expect(() => signCanonical('{}', PEM)).toThrow(Sm2UnavailableError);
  });

  it('openssl 缺失：公钥推导抛错', () => {
    expect(() => derivePublicKeyHex(PEM)).toThrow(Sm2UnavailableError);
  });

  it('错误信息点明缺的是 openssl（可诊断，而非笼统失败）', () => {
    expect(() => signCanonical('{}', PEM)).toThrow(/openssl/);
  });
});
