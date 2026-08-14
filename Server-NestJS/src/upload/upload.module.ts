import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadController } from './upload.controller';
import { ImageProcessorService } from './image-processor.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
    }),
    StorageModule,
  ],
  controllers: [UploadController],
  providers: [ImageProcessorService],
})
export class UploadModule {}
