// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';

/**
 * S3 / MinIO / OSS（S3 兼容端点）存储。
 * 返回完整 URL（S3_PUBLIC_URL 优先，否则用 endpoint + bucket 拼）。
 */
@Injectable()
export class S3StorageService implements StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(configService: ConfigService) {
    const endpoint = configService.get<string>('S3_ENDPOINT', '');
    const region = configService.get<string>('S3_REGION', 'us-east-1');
    this.bucket = configService.getOrThrow<string>('S3_BUCKET');
    this.publicUrl = configService.get<string>('S3_PUBLIC_URL', '');

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
        ACL: 'public-read',
      }),
    );
    this.logger.log(`[Storage] saved s3: ${key}`);
    return this._toUrl(key);
  }

  async delete(key: string): Promise<void> {
    const objectKey = key.replace(/^https?:\/\/[^/]+\//, '');
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
    } catch (err) {
      this.logger.warn(`[Storage] s3 delete failed: ${(err as Error).message}`);
    }
  }

  private _toUrl(key: string): string {
    if (this.publicUrl) return `${this.publicUrl.replace(/\/$/, '')}/${key}`;
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
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
