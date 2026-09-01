// SPDX-License-Identifier: Apache-2.0

import { BadRequestException } from '@nestjs/common';
import { UploadController } from './upload.controller';
import type { StorageService } from '../storage/storage.service';
import { ImageProcessorService, ProcessedImage } from './image-processor.service';
import { UploadSignService } from './upload-sign.service';

/** 最小合法 PNG 头（魔数 89504e47） */
const PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

describe('UploadController', () => {
  let controller: UploadController;
  let storageService: { save: jest.Mock };
  let imageProcessor: { processImage: jest.Mock };
  let uploadSign: { signUrl: jest.Mock };

  const processed: ProcessedImage = {
    buffer: Buffer.from('webp-data'),
    filename: 'photo.webp',
    mimetype: 'image/webp',
  };

  beforeEach(() => {
    storageService = { save: jest.fn() };
    imageProcessor = { processImage: jest.fn() };
    uploadSign = {
      signUrl: jest.fn((p: string) => (p.startsWith('/') ? `${p}?e=1&s=sig` : p)),
    };
    controller = new UploadController(
      storageService as unknown as StorageService,
      imageProcessor as unknown as ImageProcessorService,
      uploadSign as unknown as UploadSignService,
    );
  });

  it('成功上传：校验魔数、处理图片、保存并返回元数据', async () => {
    imageProcessor.processImage.mockResolvedValue(processed);
    storageService.save.mockResolvedValue('http://localhost/uploads/123-photo.webp');

    const file = {
      originalname: 'photo.png',
      mimetype: 'image/png',
      buffer: PNG_BUFFER,
    } as Express.Multer.File;

    const result = await controller.uploadFile(file);

    expect(imageProcessor.processImage).toHaveBeenCalledWith(PNG_BUFFER, 'photo.png', 'image/png');
    expect(storageService.save).toHaveBeenCalledWith(
      processed.buffer,
      processed.filename,
      processed.mimetype,
    );
    expect(result).toEqual({
      url: 'http://localhost/uploads/123-photo.webp',
      filename: '123-photo.webp',
      originalName: 'photo.png',
      size: processed.buffer.length,
      mimeType: 'image/webp',
    });
  });

  it('缺文件时抛 400', async () => {
    await expect(controller.uploadFile(undefined as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('不允许的扩展名抛 400', async () => {
    const file = {
      originalname: 'evil.exe',
      mimetype: 'application/zip',
      buffer: Buffer.from('PK..'),
    } as Express.Multer.File;

    await expect(controller.uploadFile(file)).rejects.toThrow('不允许的文件类型');
  });

  it('魔数不匹配抛 400', async () => {
    const file = {
      originalname: 'fake.png',
      mimetype: 'image/png',
      buffer: Buffer.from('this is not a png at all'),
    } as Express.Multer.File;

    await expect(controller.uploadFile(file)).rejects.toThrow('文件类型校验失败');
    expect(imageProcessor.processImage).not.toHaveBeenCalled();
  });

  it('gif 等不可处理类型原样透传保存', async () => {
    const gifProcessed: ProcessedImage = {
      buffer: Buffer.from('GIF89a...'),
      filename: 'anim.gif',
      mimetype: 'image/gif',
    };
    imageProcessor.processImage.mockResolvedValue(gifProcessed);
    storageService.save.mockResolvedValue('http://localhost/uploads/anim.gif');

    const file = {
      originalname: 'anim.gif',
      mimetype: 'image/gif',
      buffer: Buffer.from('GIF89a-data'),
    } as Express.Multer.File;

    const result = await controller.uploadFile(file);
    expect(result.mimeType).toBe('image/gif');
    expect(result.filename).toBe('anim.gif');
  });

  it('CR-21：本地相对路径 URL 返回带签名 query（绝对 URL 原样透传）', async () => {
    imageProcessor.processImage.mockResolvedValue(processed);
    storageService.save.mockResolvedValue('/uploads/123-photo.webp');

    const file = {
      originalname: 'photo.png',
      mimetype: 'image/png',
      buffer: PNG_BUFFER,
    } as Express.Multer.File;

    const result = await controller.uploadFile(file);

    expect(uploadSign.signUrl).toHaveBeenCalledWith('/uploads/123-photo.webp');
    expect(result.url).toBe('/uploads/123-photo.webp?e=1&s=sig');
    // filename 取签名前路径段
    expect(result.filename).toBe('123-photo.webp');
  });
});
