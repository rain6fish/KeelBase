// SPDX-License-Identifier: Apache-2.0

/**
 * D2-2 独立治理控制平面启动入口：
 *   npm run start:governance
 * 独立进程连独立治理库（GovernanceDataSource），提供审计/Agent/策略/审批列表/副作用查询。
 * 端口：GOVERNANCE_PORT（默认 3100，避免与主应用 3000 冲突）。
 * 认证：复用 JWT（共享 JWT_SECRET，admin role 可访问治理端点）。
 */
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GovernanceModule } from './governance.module';

async function bootstrap() {
  const app = await NestFactory.create(GovernanceModule);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  const port = Number(process.env.GOVERNANCE_PORT || 3100);
  // 启动诊断（保留：打印关键 env，便于排查认证/库连接；不打印密钥本身/前缀——CodeQL csharp/clear-text-logging）
  const cfg = app.get(ConfigService);
  const jitSecretCfg = Boolean(cfg.get<string>('JWT_SECRET'));
  console.log(`[Governance] cwd=${process.cwd()} JWT_SECRET env=${process.env.JWT_SECRET ? 'configured' : 'missing'} cfg=${jitSecretCfg ? 'configured' : 'missing'} DB_PATH=${process.env.DB_PATH}`);
  await app.listen(port);
  console.log(`[Governance] standalone control plane listening on :${port} (api/v1)`);
}

bootstrap().catch((err) => {
  console.error('[Governance] failed to start:', err);
  process.exit(1);
});
