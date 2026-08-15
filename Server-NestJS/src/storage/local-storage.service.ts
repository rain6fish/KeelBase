import { Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import { promises as fs } from 'fs';
import * as path from 'path';
import { StorageService } from './storage.service';

/** 本地存储根目录（与 controller 旧 UPLOAD_DIR 一致） */
export const LOCAL_UPLOAD_DIR = join(__dirname, '../../uploads');

/**
 * 本地磁盘存储：文件写入 uploads/，URL 为 /uploads/xxx（经 main.ts 静态托管 + nginx 代理）。
 */
@Injectable()
export class LocalStorageService implements StorageService {
  private readonly logger = new Logger(LocalStorageService.name);

  constructor() {
    fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true }).catch(() => undefined);
  }

  async save(buffer: Buffer, originalName: string, _mimetype: string): Promise<string> {
    const ext = path.extname(originalName).toLowerCase();
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    await fs.writeFile(join(LOCAL_UPLOAD_DIR, filename), buffer);
    this.logger.log(`[Storage] saved local: ${filename}`);
    return `/uploads/${filename}`;
  }

  async delete(key: string): Promise<void> {
    // key 形如 /uploads/xxx 或 xxx
    const filename = key.replace(/^\/uploads\//, '');
    try {
      await fs.unlink(join(LOCAL_UPLOAD_DIR, filename));
    } catch (err) {
      this.logger.warn(`[Storage] local delete failed: ${(err as Error).message}`);
    }
  }

  /** A8：本地磁盘健康——目录可访问即可（不可写会在 save 时报错） */
  async checkHealth(): Promise<'up' | 'down'> {
    try {
      await fs.access(LOCAL_UPLOAD_DIR);
      return 'up';
    } catch {
      return 'down';
    }
  }
}
