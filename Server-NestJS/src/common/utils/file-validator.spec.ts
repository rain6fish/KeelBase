import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';
import { validateFileMagicBytes, validateMagicBytes } from './file-validator';

jest.mock('fs/promises');
const fsMock = fs as jest.Mocked<typeof fs>;

describe('validateMagicBytes（内存版）', () => {
  it('未知 MIME 类型直接返回不校验', () => {
    expect(() => validateMagicBytes(Buffer.from('xxx'), 'application/octet-stream')).not.toThrow();
  });

  it('JPEG 魔数匹配通过', () => {
    const buf = Buffer.concat([Buffer.from('ffd8ff', 'hex'), Buffer.from('REST')]);
    expect(() => validateMagicBytes(buf, 'image/jpeg')).not.toThrow();
  });

  it('PNG 魔数不匹配抛 BadRequestException', () => {
    const buf = Buffer.from('not-a-png', 'utf8');
    expect(() => validateMagicBytes(buf, 'image/png')).toThrow(BadRequestException);
  });

  it('ZIP 多魔数任一匹配即通过', () => {
    const buf = Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.from('x')]);
    expect(() => validateMagicBytes(buf, 'application/zip')).not.toThrow();
  });

  it('WebP：RIFF@0 + WEBP@8 双校验通过', () => {
    const buf = Buffer.from('RIFFABCDWEBP', 'ascii');
    expect(() => validateMagicBytes(buf, 'image/webp')).not.toThrow();
  });

  it('WAV（同为 RIFF 头）伪装 image/webp 被拒', () => {
    const buf = Buffer.from('RIFFABCDWAVE', 'ascii');
    expect(() => validateMagicBytes(buf, 'image/webp')).toThrow(BadRequestException);
  });
});

describe('validateFileMagicBytes（磁盘版）', () => {
  const magicBuffer = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(32)]);

  function mockOpenWith(content: Buffer) {
    const read = jest.fn((buf: Buffer, off: number, len: number) => {
      content.copy(buf, off, 0, Math.min(len, content.length));
      return Promise.resolve(Math.min(len, content.length));
    });
    const close = jest.fn().mockResolvedValue(undefined);
    fsMock.open.mockResolvedValue({ read, close } as any);
    return { read, close };
  }

  beforeEach(() => { jest.resetAllMocks(); });

  it('未知 MIME 类型返回（不打开文件）', async () => {
    await expect(validateFileMagicBytes('/tmp/x', 'text/plain')).resolves.toBeUndefined();
    expect(fsMock.open).not.toHaveBeenCalled();
  });

  it('魔数匹配通过（校验成功不删除）', async () => {
    mockOpenWith(magicBuffer);
    await expect(validateFileMagicBytes('/tmp/x.jpg', 'image/jpeg')).resolves.toBeUndefined();
    expect(fsMock.unlink).not.toHaveBeenCalled();
  });

  it('魔数不匹配删除文件并抛 BadRequestException', async () => {
    mockOpenWith(Buffer.from('GARBAGE'));
    await expect(validateFileMagicBytes('/tmp/x.jpg', 'image/jpeg')).rejects.toThrow(BadRequestException);
    expect(fsMock.unlink).toHaveBeenCalledWith('/tmp/x.jpg');
  });

  it('打开文件失败抛 BadRequestException（不误报原错误）', async () => {
    fsMock.open.mockRejectedValue(new Error('ENOENT'));
    await expect(validateFileMagicBytes('/tmp/x.jpg', 'image/jpeg')).rejects.toThrow(BadRequestException);
  });

  it('读取失败抛 BadRequestException', async () => {
    fsMock.open.mockResolvedValue({
      read: jest.fn().mockRejectedValue(new Error('io error')),
      close: jest.fn().mockResolvedValue(undefined),
    } as any);
    await expect(validateFileMagicBytes('/tmp/x.jpg', 'image/jpeg')).rejects.toThrow(BadRequestException);
  });
});
