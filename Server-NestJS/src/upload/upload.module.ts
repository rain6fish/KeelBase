// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadController } from './upload.controller';
import { ImageProcessorService } from './image-processor.service';
import { UploadSignService } from './upload-sign.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
    }),
    StorageModule,
  ],
  controllers: [UploadController],
  providers: [ImageProcessorService, UploadSignService],
  exports: [UploadSignService],
})
export class UploadModule {}
