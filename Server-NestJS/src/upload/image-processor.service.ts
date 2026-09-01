// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import sharp from 'sharp';
import { withSpan } from '../common/tracing/tracer';

export interface ProcessedImage {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

/** 可转 WebP 的光栅图片 MIME */
const PROCESSABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** 最大宽度（超过则降，小图不放大） */
const MAX_WIDTH = 1280;
const WEBP_QUALITY = 80;

/**
 * 图片处理：光栅图（jpeg/png/webp）统一转 WebP（质量 80）+ 宽度上限 1280，
 * gif/pdf/zip 原样返回。处理失败静默降级为原图（不阻断上传）。
 */
@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);

  async processImage(
    buffer: Buffer,
    originalName: string,
    mimetype: string,
  ): Promise<ProcessedImage> {
    return withSpan('image.process', async () => {
      return this.processImageImpl(buffer, originalName, mimetype);
    }, { 'image.mimetype': mimetype, 'image.bytes': buffer.length });
  }

  private async processImageImpl(
    buffer: Buffer,
    originalName: string,
    mimetype: string,
  ): Promise<ProcessedImage> {
    if (!PROCESSABLE.has(mimetype)) {
      return { buffer, filename: originalName, mimetype };
    }

    try {
      const processed = await sharp(buffer)
        .rotate() // 修正 EXIF 方向
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      const filename = `${path.basename(originalName, path.extname(originalName))}.webp`;
      this.logger.log(`[ImageProcessor] ${originalName} → ${filename} (${buffer.length}→${processed.length}b)`);
      return { buffer: processed, filename, mimetype: 'image/webp' };
    } catch (err) {
      // 处理失败降级为原图
      this.logger.warn(`[ImageProcessor] process failed, keep original: ${(err as Error).message}`);
      return { buffer, filename: originalName, mimetype };
    }
  }
}
