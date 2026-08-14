import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';

interface MagicBytesRule {
  mime: string;
  /** 文件头部特征字节（十六进制字符串） */
  magic: string[];
  /** 匹配偏移量（字节） */
  offset?: number;
}

const MAGIC_BYTES: MagicBytesRule[] = [
  { mime: 'image/jpeg', magic: ['ffd8ff'] },
  { mime: 'image/png', magic: ['89504e47'] },
  { mime: 'image/gif', magic: ['47494638'] },
  { mime: 'image/webp', magic: ['52494646'], offset: 0 }, // RIFF header
  { mime: 'application/pdf', magic: ['25504446'] },
  { mime: 'application/zip', magic: ['504b0304', '504b0506', '504b0708'] },
  // docx 本质是 zip
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: ['504b0304', '504b0506', '504b0708'],
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
    const offset = rule.offset ?? 0;
    const length = Math.max(...rule.magic.map((m) => m.length / 2)) + offset;
    const buf = Buffer.alloc(length);
    await fd.read(buf, 0, length, 0);

    const hex = buf.subarray(offset).toString('hex').toLowerCase();
    const matched = rule.magic.some((m) => hex.startsWith(m.toLowerCase()));

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

  const offset = rule.offset ?? 0;
  const hex = buffer.subarray(offset).toString('hex').toLowerCase();
  const matched = rule.magic.some((m) => hex.startsWith(m.toLowerCase()));

  if (!matched) {
    throw new BadRequestException(
      `文件类型校验失败：声明为 ${declaredMime}，但文件头部特征不匹配`,
    );
  }
}
