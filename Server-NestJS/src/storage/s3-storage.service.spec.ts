// SPDX-License-Identifier: Apache-2.0

import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3StorageService } from './s3-storage.service';

jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn().mockResolvedValue({});
  return {
    S3Client: jest.fn(() => ({ send })),
    PutObjectCommand: jest.fn((args: any) => ({ __type: 'PutObjectCommand', ...args })),
    GetObjectCommand: jest.fn((args: any) => ({ __type: 'GetObjectCommand', ...args })),
    DeleteObjectCommand: jest.fn((args: any) => ({ __type: 'DeleteObjectCommand', ...args })),
    HeadBucketCommand: jest.fn((args: any) => ({ __type: 'HeadBucketCommand', ...args })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://presigned.example/bucket/key?X-Amz-Signature=abc'),
}));

describe('S3StorageService', () => {
  const mockConfig = {
    get: jest.fn((key: string, def?: any) => {
      const map: Record<string, any> = {
        S3_ENDPOINT: 'http://localhost:9000',
        S3_REGION: 'us-east-1',
        S3_BUCKET: 'test-bucket',
        S3_PUBLIC_URL: '',
        S3_SIGNED_URL_TTL: '900',
      };
      return map[key] ?? def;
    }),
    getOrThrow: jest.fn((key: string) => {
      const secrets: Record<string, string> = {
        S3_BUCKET: 'test-bucket',
        S3_ACCESS_KEY: 'access',
        S3_SECRET_KEY: 'secret',
      };
      if (!secrets[key]) throw new Error(`Missing ${key}`);
      return secrets[key];
    }),
  } as unknown as ConfigService;

  beforeEach(() => jest.clearAllMocks());

  it('save calls PutObject with no public-read ACL (CR-21 private) and returns a /uploads reference', async () => {
    const service = new S3StorageService(mockConfig);

    const url = await service.save(Buffer.from('data'), 'photo.jpg', 'image/jpeg');

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({ forcePathStyle: true }),
    );
    const cmd = (PutObjectCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(cmd.Bucket).toBe('test-bucket');
    expect(cmd.Body).toEqual(Buffer.from('data'));
    // CR-21：bucket 私有 —— 不再带 public-read ACL
    expect(cmd.ACL).toBeUndefined();
    // 返回稳定的 /uploads 引用（实际取用走签名 + presigned）
    expect(url).toMatch(/^\/uploads\/\d{4}-\d{2}-\d{2}\/.+\.jpg$/);
  });

  it('accessRedirectUrl presigns a time-limited GET URL (bucket private)', async () => {
    const service = new S3StorageService(mockConfig);

    const target = await service.accessRedirectUrl('/uploads/2026-08-05/123.jpg');

    expect(GetObjectCommand).toHaveBeenCalledWith({ Bucket: 'test-bucket', Key: '2026-08-05/123.jpg' });
    // expiresIn 取自 S3_SIGNED_URL_TTL（这里 900）
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ __type: 'GetObjectCommand' }),
      { expiresIn: 900 },
    );
    expect(target).toBe('https://presigned.example/bucket/key?X-Amz-Signature=abc');
  });

  it('accessRedirectUrl uses S3_PUBLIC_URL prefix when configured (public/CDN opt-in)', async () => {
    const cfg = {
      ...mockConfig,
      get: jest.fn((key: string, def?: any) =>
        key === 'S3_PUBLIC_URL' ? 'https://cdn.example.com' : (mockConfig.get as any)(key, def),
      ),
    } as unknown as ConfigService;
    const service = new S3StorageService(cfg);

    const target = await service.accessRedirectUrl('/uploads/2026-08-05/a.png');

    expect(target).toBe('https://cdn.example.com/2026-08-05/a.png');
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('delete strips the /uploads/ reference prefix and calls DeleteObject', async () => {
    const service = new S3StorageService(mockConfig);

    await service.delete('/uploads/2026-08-05/123.jpg');

    const cmd = (DeleteObjectCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(cmd.Key).toBe('2026-08-05/123.jpg');
  });

  it('delete still strips a legacy absolute-URL prefix', async () => {
    const service = new S3StorageService(mockConfig);

    await service.delete('https://test-bucket.s3.amazonaws.com/2026-08-05/123.jpg');

    const cmd = (DeleteObjectCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(cmd.Key).toBe('2026-08-05/123.jpg');
  });

  it('checkHealth：HEAD bucket 可达返回 up（A8）', async () => {
    const service = new S3StorageService(mockConfig);
    await expect(service.checkHealth()).resolves.toBe('up');
    const cmd = (HeadBucketCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(cmd.Bucket).toBe('test-bucket');
  });

  it('checkHealth：HEAD 失败返回 down（A8）', async () => {
    const { S3Client: MockS3Client } = jest.requireMock('@aws-sdk/client-s3') as any;
    const send = jest.fn().mockRejectedValue(new Error('bucket unreachable'));
    MockS3Client.mockImplementationOnce(() => ({ send }));
    const service = new S3StorageService(mockConfig);
    await expect(service.checkHealth()).resolves.toBe('down');
  });
});
