import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditChainService } from './audit-chain.service';

@Module({
  imports: [ConfigModule],
  providers: [AuditChainService],
  exports: [AuditChainService],
})
export class AuditChainModule {}
