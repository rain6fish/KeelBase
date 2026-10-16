// SPDX-License-Identifier: Apache-2.0

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

  /**
   * CR-21 stage C: normalise an upload URL into a bare reference before it is persisted — drop the
   * query string (which carries the `e` / `s` signature that upload froze). The store no longer holds
   * a string that expires, so the read side `signUrl` re-signs on every access and the signature is
   * always fresh. Without this, a stored signed URL is returned verbatim by `signUrl` (it passes any
   * path containing a `?` straight through), so once the TTL elapses every read 403s and re-fetching
   * the record does not help — the old signature is still what is stored.
   *
   * Symmetric with `signUrl`: only `/uploads` relative paths are normalised. Absolute URLs (S3 public
   * prefixes, or a future presigned URL whose query *is* the credential) pass through unchanged.
   *
   * CR-21 stage C：入库前把上传 URL 归一化成「裸引用」——剥掉 query（其中带着上传时冻结的 `e` / `s`
   * 签名）。库里不再存会过期的签名串，读侧 `signUrl` 每次访问重新签名，故签名永远新鲜。否则存进去的
   * 签名 URL 会被 `signUrl` 原样返回（它见 `?` 就放行），TTL 一到每次读取都 403，且重取记录也无济于事
   * ——库里还是那串旧签名。
   *
   * 与 `signUrl` 对称：只处理 `/uploads` 相对路径；绝对 URL（S3 公网前缀，或未来把 query 当凭据的预签名
   * URL）原样返回，不剥 query。
   */
  normalizeForStorage(url: string): string {
    if (!url || !url.startsWith('/')) return url;
    const q = url.indexOf('?');
    return q === -1 ? url : url.slice(0, q);
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
