import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { validateMagicBytes } from '../common/utils/file-validator';
import { STORAGE_SERVICE } from '../storage/storage.service';
import type { StorageService } from '../storage/storage.service';
import { ImageProcessorService } from './image-processor.service';

/** 安全的文件扩展名白名单 — 与 MIME 互相印证 */
const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.zip',
]);

@ApiTags('文件上传')
@ApiBearerAuth()
@Controller({ path: 'upload', version: '1' })
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
    private readonly imageProcessor: ImageProcessorService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '上传文件（支持 jpg/png/gif/webp/pdf/zip，最大 10MB）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
        files: 1, // 单次只允许上传一个文件
      },
      fileFilter: (_req, file, callback) => {
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'application/zip',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(new BadRequestException('不支持的文件格式'), false);
        }
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('请选择要上传的文件');
    }

    // 扩展名白名单校验（原 diskStorage filename 回调职责，改 memoryStorage 后在此处理）
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`不允许的文件类型: ${ext}`);
    }

    // 魔数校验（MIME 声明可能被篡改）— buffer 版，不依赖磁盘
    try {
      validateMagicBytes(file.buffer, file.mimetype);
    } catch (err) {
      this.logger.warn(`文件魔数校验失败: ${file.originalname} (${file.mimetype})`);
      throw err;
    }

    // 图片处理（光栅图 → WebP + 尺寸上限；gif/pdf/zip 原样；失败降级）
    const processed = await this.imageProcessor.processImage(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    const url = await this.storageService.save(
      processed.buffer,
      processed.filename,
      processed.mimetype,
    );
    const filename = url.split('/').pop() ?? processed.filename;

    this.logger.log(
      `文件上传成功: ${filename} (${processed.buffer.length}b, ${processed.mimetype})`,
    );

    return {
      url,
      filename,
      originalName: file.originalname,
      size: processed.buffer.length,
      mimeType: processed.mimetype,
    };
  }
}
