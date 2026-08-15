import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { S3StorageService } from './s3-storage.service';

jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn().mockResolvedValue({});
  return {
    S3Client: jest.fn(() => ({ send })),
    PutObjectCommand: jest.fn((args: any) => ({ __type: 'PutObjectCommand', ...args })),
    DeleteObjectCommand: jest.fn((args: any) => ({ __type: 'DeleteObjectCommand', ...args })),
    HeadBucketCommand: jest.fn((args: any) => ({ __type: 'HeadBucketCommand', ...args })),
  };
});

describe('S3StorageService', () => {
  const mockConfig = {
    get: jest.fn((key: string, def?: any) => {
      const map: Record<string, any> = {
        S3_ENDPOINT: 'http://localhost:9000',
        S3_REGION: 'us-east-1',
        S3_BUCKET: 'test-bucket',
        S3_PUBLIC_URL: '',
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

  it('save calls PutObject and returns public URL', async () => {
    const service = new S3StorageService(mockConfig);

    const url = await service.save(Buffer.from('data'), 'photo.jpg', 'image/jpeg');

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({ forcePathStyle: true }),
    );
    const cmd = (PutObjectCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(cmd.Bucket).toBe('test-bucket');
    expect(cmd.Body).toEqual(Buffer.from('data'));
    expect(cmd.ACL).toBe('public-read');
    expect(url).toContain('test-bucket.s3.amazonaws.com');
  });

  it('uses S3_PUBLIC_URL prefix when configured', async () => {
    const cfg = {
      ...mockConfig,
      get: jest.fn((key: string, def?: any) =>
        key === 'S3_PUBLIC_URL' ? 'https://cdn.example.com' : (mockConfig.get as any)(key, def),
      ),
    } as unknown as ConfigService;
    const service = new S3StorageService(cfg);

    const url = await service.save(Buffer.from('x'), 'a.png', 'image/png');

    expect(url.startsWith('https://cdn.example.com/')).toBe(true);
  });

  it('delete strips URL prefix and calls DeleteObject', async () => {
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
