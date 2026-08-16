import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperationAuditController } from './operation-audit.controller';
import { OperationAuditService } from './operation-audit.service';
import { OperationAuditInterceptor } from './operation-audit.interceptor';
import { OperationAuditLog } from './operation-audit-log.entity';
import { AuditChainModule } from '../common/audit-chain/audit-chain.module';

@Module({
  imports: [TypeOrmModule.forFeature([OperationAuditLog]), AuditChainModule],
  controllers: [OperationAuditController],
  providers: [OperationAuditService, OperationAuditInterceptor],
  exports: [OperationAuditService],
})
export class OperationAuditModule {}
