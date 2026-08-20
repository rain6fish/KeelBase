import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';

interface MagicBytesCheck {
  /** 文件头部特征字节（十六进制字符串），任一匹配即通过该项 */
  magic: string[];
  /** 匹配偏移量（字节），默认 0 */
  offset?: number;
}

interface MagicBytesRule {
  mime: string;
  /** 多项特征需全部匹配才通过（如 WebP = RIFF 头 + offset 8 的 "WEBP" 标记） */
  checks: MagicBytesCheck[];
}

const MAGIC_BYTES: MagicBytesRule[] = [
  { mime: 'image/jpeg', checks: [{ magic: ['ffd8ff'] }] },
  { mime: 'image/png', checks: [{ magic: ['89504e47'] }] },
  { mime: 'image/gif', checks: [{ magic: ['47494638'] }] },
  // WebP = RIFF 头（offset 0）+ "WEBP" 标记（offset 8），防 WAV/AVI（同为 RIFF）伪装
  {
    mime: 'image/webp',
    checks: [
      { magic: ['52494646'], offset: 0 },
      { magic: ['57454250'], offset: 8 },
    ],
  },
  { mime: 'application/pdf', checks: [{ magic: ['25504446'] }] },
  { mime: 'application/zip', checks: [{ magic: ['504b0304', '504b0506', '504b0708'] }] },
  // docx 本质是 zip
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    checks: [{ magic: ['504b0304', '504b0506', '504b0708'] }],
  },
];

/**
 * 验证文件是否匹配其声明的 MIME 类型的魔数头部。
 * 防止攻击者上传伪装 MIME 类型的恶意文件。
 */
export async function validateFileMagicBytes(
  filePath: string,
  declaredMime: string,
): Promise<void> {
  const rule = MAGIC_BYTES.find((r) => r.mime === declaredMime);
  if (!rule) return; // 不验证未定义规则的类型

  let fd;
  try {
    fd = await fs.open(filePath, 'r');
    const length = Math.max(
      ...rule.checks.flatMap((c) => c.magic.map((m) => m.length / 2 + (c.offset ?? 0))),
    );
    const buf = Buffer.alloc(length);
    await fd.read(buf, 0, length, 0);

    const matched = rule.checks.every((c) => {
      const hex = buf.subarray(c.offset ?? 0).toString('hex').toLowerCase();
      return c.magic.some((m) => hex.startsWith(m.toLowerCase()));
    });

    if (!matched) {
      await fs.unlink(filePath); // 删除无效文件
      throw new BadRequestException(
        `文件类型校验失败：声明为 ${declaredMime}，但文件头部特征不匹配`,
      );
    }
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    throw new BadRequestException('文件校验过程中出现错误');
  } finally {
    if (fd) await fd.close();
  }
}

/**
 * 从内存 buffer 校验魔数（memoryStorage 上传时使用，不依赖磁盘路径）。
 */
export function validateMagicBytes(
  buffer: Buffer,
  declaredMime: string,
): void {
  const rule = MAGIC_BYTES.find((r) => r.mime === declaredMime);
  if (!rule) return; // 不验证未定义规则的类型

  const matched = rule.checks.every((c) => {
    const hex = buffer.subarray(c.offset ?? 0).toString('hex').toLowerCase();
    return c.magic.some((m) => hex.startsWith(m.toLowerCase()));
  });

  if (!matched) {
    throw new BadRequestException(
      `文件类型校验失败：声明为 ${declaredMime}，但文件头部特征不匹配`,
    );
  }
}
