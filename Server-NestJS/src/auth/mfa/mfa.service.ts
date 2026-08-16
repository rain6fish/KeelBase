import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * WEB-FRONT-4：TOTP (RFC 6238) 双因素认证。零外部依赖，基于 node:crypto。
 * - secret：20 字节随机，RFC 4648 base32（无填充）
 * - code：HMAC-SHA1 + dynamic truncation，6 位，30s 周期
 * - 验证：±1 步容错（时钟漂移容忍）
 */
@Injectable()
export class MfaService {
  private static readonly BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  private static readonly STEP_SECONDS = 30;
  private static readonly CODE_DIGITS = 6;

  /** 生成随机 TOTP secret（base32，无填充）。 */
  generateSecret(): string {
    return this._base32Encode(crypto.randomBytes(20));
  }

  /** otpauth URL（供二维码/手动录入；issuer=KeelBase，account=用户名）。 */
  otpauthUrl(secret: string, account: string): string {
    const label = encodeURIComponent(`KeelBase:${account}`);
    const params = new URLSearchParams({
      secret,
      issuer: 'KeelBase',
      algorithm: 'SHA1',
      digits: String(MfaService.CODE_DIGITS),
      period: String(MfaService.STEP_SECONDS),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  /** 校验用户提交的 6 位 code（±1 步容错）。 */
  verifyCode(secret: string, code: string): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    const counter = Math.floor(Date.now() / 1000 / MfaService.STEP_SECONDS);
    for (let offset = -1; offset <= 1; offset++) {
      if (this._totp(secret, counter + offset) === code) return true;
    }
    return false;
  }

  /** 固定时间步的 TOTP code（测试可注入 counter 间接覆盖）。 */
  private _totp(secret: string, counter: number): string {
    const key = this._base32Decode(secret);
    const msg = Buffer.alloc(8);
    msg.writeBigUInt64BE(BigInt(counter), 0);
    const hmac = crypto.createHmac('sha1', key).update(msg).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const bin =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return String(bin % 10 ** MfaService.CODE_DIGITS).padStart(MfaService.CODE_DIGITS, '0');
  }

  private _base32Encode(buf: Buffer): string {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of buf) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        out += MfaService.BASE32[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += MfaService.BASE32[(value << (5 - bits)) & 31];
    return out;
  }

  private _base32Decode(str: string): Buffer {
    const clean = str.toUpperCase().replace(/=+$/, '');
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];
    for (const ch of clean) {
      const idx = MfaService.BASE32.indexOf(ch);
      if (idx < 0) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(bytes);
  }
}
