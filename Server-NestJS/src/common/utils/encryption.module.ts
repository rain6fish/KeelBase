import { Module, Global } from '@nestjs/common';
import { EncryptionService } from './encryption';

@Global()
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
