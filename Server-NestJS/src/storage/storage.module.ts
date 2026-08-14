import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { STORAGE_SERVICE } from './storage.service';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';

/**
 * 存储模块：按 STORAGE_DRIVER（local 默认 / s3）提供存储实现。
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_SERVICE,
      useFactory: (configService: ConfigService) => {
        const driver = configService.get<string>('STORAGE_DRIVER', 'local');
        if (driver === 's3') {
          return new S3StorageService(configService);
        }
        return new LocalStorageService();
      },
      inject: [ConfigService],
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
