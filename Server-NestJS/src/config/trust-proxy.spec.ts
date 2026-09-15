// SPDX-License-Identifier: Apache-2.0

/**
 * AU-1（§22.19 审计归因层）：`trust proxy` 取值解析单测。
 * 关键护栏：任何输入都**不得**返回 boolean `true`（= 盲信任意上游 XFF，IP 可伪造）。
 */
import { parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy（AU-1）', () => {
  it('默认（未设/空）→ 1 跳（自带 nginx 单层）', () => {
    expect(parseTrustProxy()).toBe(1);
    expect(parseTrustProxy('')).toBe(1);
    expect(parseTrustProxy('   ')).toBe(1);
  });

  it('纯数字 → 跳数', () => {
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy(' 3 ')).toBe(3);
  });

  it('0 / false → 不信任（false）', () => {
    expect(parseTrustProxy('0')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('FALSE')).toBe(false);
  });

  it('CIDR / 子网列表 / 具名 → 原样交 Express', () => {
    expect(parseTrustProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
    expect(parseTrustProxy('loopback, 172.17.0.0/16')).toBe('loopback, 172.17.0.0/16');
  });

  it('护栏：任何输入都不返回 boolean true（禁盲信 XFF；含 "true" 亦拒绝为不信任）', () => {
    for (const i of [undefined, '', '   ', '0', 'false', 'true', 'TRUE', '1', '2', 'loopback', '10.0.0.0/8']) {
      expect(parseTrustProxy(i)).not.toBe(true);
    }
    expect(parseTrustProxy('true')).toBe(false);
  });
});
