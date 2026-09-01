// SPDX-License-Identifier: Apache-2.0

import * as crypto from 'crypto';
import { MfaService } from './mfa.service';

/** 独立 RFC 6238 TOTP 计算器（交叉验证 MfaService 实现）。 */
function totp(secretBase32: string, counter: number): string {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of secretBase32.toUpperCase().replace(/=+$/, '')) {
    value = (value << 5) | table.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const key = Buffer.from(bytes);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter), 0);
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 1000000).padStart(6, '0');
}

describe('MfaService (WEB-FRONT-4 / RFC 6238)', () => {
  let svc: MfaService;

  beforeEach(() => {
    svc = new MfaService();
  });

  it('generateSecret 返回 base32 字符串（无填充）', () => {
    const secret = svc.generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(26);
  });

  it('otpauthUrl 生成标准格式', () => {
    const url = svc.otpauthUrl('ABC234', 'alice');
    expect(url).toMatch(/^otpauth:\/\/totp\/KeelBase%3Aalice\?/);
    expect(url).toContain('secret=ABC234');
    expect(url).toContain('issuer=KeelBase');
    expect(url).toContain('period=30');
    expect(url).toContain('digits=6');
  });

  it('verifyCode 接受当前时间步的 code（±1 步容错）', () => {
    const secret = svc.generateSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const code = totp(secret, counter);
    expect(svc.verifyCode(secret, code)).toBe(true);
  });

  it('verifyCode 接受 ±1 时间步（时钟漂移容忍）', () => {
    const secret = svc.generateSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    expect(svc.verifyCode(secret, totp(secret, counter - 1))).toBe(true);
    expect(svc.verifyCode(secret, totp(secret, counter + 1))).toBe(true);
  });

  it('verifyCode 拒绝错误/格式非法 code', () => {
    const secret = svc.generateSecret();
    expect(svc.verifyCode(secret, '000000')).toBe(false);
    expect(svc.verifyCode(secret, 'abc')).toBe(false);
    expect(svc.verifyCode(secret, '12345')).toBe(false);
    expect(svc.verifyCode(secret, '1234567')).toBe(false);
  });

  it('round-trip：独立计算器与 MfaService 对同一 secret 结果一致（base32 编解码正确）', () => {
    const secret = svc.generateSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    // counter+1 在 ±1 容错内；若 MfaService 的 base32Decode 错位，独立计算器会算出不同 code
    expect(svc.verifyCode(secret, totp(secret, counter + 1))).toBe(true);
  });
});
