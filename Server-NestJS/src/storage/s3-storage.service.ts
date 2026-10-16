// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from './storage.service';

/**
 * S3 / MinIO / OSS (S3-compatible endpoints) storage.
 *
 * CR-21: objects are uploaded without a public-read ACL — the bucket is private.
 * `save` returns a stable `/uploads/<key>` reference; retrieval is served through
 * the `/uploads` access layer, which verifies the CR-21 signature and then asks
 * this driver for a time-limited presigned GET URL (see accessRedirectUrl).
 *
 * S3 / MinIO / OSS（S3 兼容端点）存储。
 *
 * CR-21：对象上传**不带 public-read ACL**——bucket 私有。`save` 返回稳定的
 * `/uploads/<key>` 引用；取用经 `/uploads` 访问层（校验 CR-21 签名后）向本驱动
 * 索取**有时效的 presigned GET URL**（见 accessRedirectUrl）。
 */
@Injectable()
export class S3StorageService implements StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly signedUrlTtl: number;

  constructor(configService: ConfigService) {
    const endpoint = configService.get<string>('S3_ENDPOINT', '');
    const region = configService.get<string>('S3_REGION', 'us-east-1');
    this.bucket = configService.getOrThrow<string>('S3_BUCKET');
    this.publicUrl = configService.get<string>('S3_PUBLIC_URL', '');
    // presigned URL 有效期（秒）；S3 SigV4 上限 7 天
    this.signedUrlTtl = Number(configService.get<string>('S3_SIGNED_URL_TTL', '3600')) || 3600;

    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: !!endpoint, // MinIO/本地 S3 需 path-style
      credentials: {
        accessKeyId: configService.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: configService.getOrThrow<string>('S3_SECRET_KEY'),
      },
    });
  }

  async save(buffer: Buffer, originalName: string, mimetype: string): Promise<string> {
    const ext = originalName.split('.').pop() ?? '';
    const key = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      }),
    );
    this.logger.log(`[Storage] saved s3: ${key}`);
    // CR-21：返回稳定的 /uploads 引用（bucket 私有，实际取用走签名 + presigned）
    return `/uploads/${key}`;
  }

  async delete(key: string): Promise<void> {
    // 兼容：新形状 /uploads/<key>，旧形状完整 URL
    const objectKey = key.replace(/^\/uploads\//, '').replace(/^https?:\/\/[^/]+\//, '');
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
    } catch (err) {
      this.logger.warn(`[Storage] s3 delete failed: ${(err as Error).message}`);
    }
  }

  /**
   * CR-21 delivery: hand the access layer a URL to redirect to.
   *
   * If S3_PUBLIC_URL is configured the operator opted into a public/CDN prefix
   * (public bucket) — use it as-is. Otherwise presign a time-limited GET URL so
   * the private object stays reachable for the life of the link only.
   *
   * CR-21 取用：给访问层一个可重定向到的 URL。
   * 配了 S3_PUBLIC_URL 即运营方选择公网/CDN 前缀（公开 bucket）——原样使用；
   * 否则签发**有时效的 presigned GET URL**，私有对象仅在该链接有效期内可取。
   */
  async accessRedirectUrl(ref: string): Promise<string | null> {
    const key = ref.replace(/^\/uploads\//, '').replace(/^\/+/, '');
    if (this.publicUrl) return `${this.publicUrl.replace(/\/$/, '')}/${key}`;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: this.signedUrlTtl },
    );
  }

  /** A8：S3 健康——HEAD bucket 可达即 up，超时/异常降级 down */
  async checkHealth(): Promise<'up' | 'down'> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return 'up';
    } catch {
      return 'down';
    }
  }
}
