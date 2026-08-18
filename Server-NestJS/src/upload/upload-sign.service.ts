import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { EncryptionService } from '../common/utils/encryption';

/**
 * CR-21 上传资源签名访问控制。
 *
 * 给 /uploads 相对路径附 HMAC 签名 + 过期时间（query: e / s），
 * 访问中间件校验后才放行——裸 URL 不再可直接爬取。
 * 签名密钥复用 EncryptionService.hmac（ENCRYPTION_KEY 派生），同一密钥体系。
 */
@Injectable()
export class UploadSignService {
  private readonly DEFAULT_TTL = 30 * 24 * 3600; // 30 天（头像等长期资源）

  constructor(private readonly encryption: EncryptionService) {}

  /** 给 /uploads 相对路径附签名 query；绝对 URL（S3）或已带签名原样返回 */
  signUrl(path: string, ttlSeconds: number = this.DEFAULT_TTL): string {
    if (!path || !path.startsWith('/')) return path;
    if (path.includes('?')) return path; // 已是绝对/已带 query（含签名）
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = this.encryption.hmac(`${path}:${expires}`);
    return `${path}?e=${expires}&s=${sig}`;
  }

  /** 校验签名与过期。e/s 缺失或过期或篡改 → false。 */
  verify(path: string, e?: string, s?: string): boolean {
    if (!e || !s) return false;
    const expires = Number(e);
    if (!Number.isFinite(expires) || expires <= 0) return false;
    if (Math.floor(Date.now() / 1000) > expires) return false;
    const expected = Buffer.from(this.encryption.hmac(`${path}:${e}`), 'utf8');
    const provided = Buffer.from(s, 'utf8');
    if (expected.length !== provided.length) return false;
    return crypto.timingSafeEqual(expected, provided);
  }
}
