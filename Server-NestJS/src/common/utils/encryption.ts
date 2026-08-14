import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * 敏感字段静态加密（AES-256-GCM）+ 确定性 HMAC 派生。
 *
 * - phone / providerId 用 encrypt() 存密文，decrypt() 读回明文（随机 IV，不可预测）
 * - providerHash 用 hmac() 确定性派生，供 providerId 精确查询（GCM 密文无法 where 匹配）
 *
 * 密钥来自 ENCRYPTION_KEY（32 字节 hex）。解密失败（数据损坏/密钥变更）抛 400。
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;
  private readonly hmacKey: Buffer;

  constructor(configService: ConfigService) {
    const keyHex = configService.get<string>('ENCRYPTION_KEY', '');
    if (keyHex.length !== 64) {
      throw new Error(
        'ENCRYPTION_KEY must be 64 hex chars (32 bytes). Generate: openssl rand -hex 32',
      );
    }
    this.key = Buffer.from(keyHex, 'hex');

    const hmacHex = configService.get<string>('ENCRYPTION_HMAC_KEY', '');
    this.hmacKey = hmacHex.length === 64 ? Buffer.from(hmacHex, 'hex') : this.key;
  }

  encrypt(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // iv:tag:ciphertext (base64)，长度固定可解
    return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    try {
      const [ivB64, tagB64, dataB64] = payload.split(':');
      const iv = Buffer.from(ivB64, 'base64');
      const tag = Buffer.from(tagB64, 'base64');
      const data = Buffer.from(dataB64, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(data), decipher.final()]);
      return dec.toString('utf8');
    } catch {
      throw new BadRequestException('数据解密失败，可能密钥已变更或数据损坏');
    }
  }

  /** 确定性派生，用于可查询的关联键（providerId） */
  hmac(value: string): string {
    return crypto.createHmac('sha256', this.hmacKey).update(value).digest('hex');
  }
}
