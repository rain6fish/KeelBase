// SPDX-License-Identifier: Apache-2.0

/**
 * 治理 sidecar 启动入口：
 *   npm run start:sidecar
 * 独立、语言无关的 AI 网关审计代理（治理能力 2.0 嵌入广度）。
 * 端口：SIDECAR_PORT（默认 3200）。
 * 业务系统 LLM base URL → http://sidecar:3200/v1，AI 调用自动上报治理台审计。
 */
import { NestFactory } from '@nestjs/core';
import { SidecarModule } from './sidecar.module';

async function bootstrap() {
  const app = await NestFactory.create(SidecarModule);
  app.enableShutdownHooks();
  const port = Number(process.env.SIDECAR_PORT || 3200);
  await app.listen(port);
  console.log(`[Sidecar] AI gateway audit proxy listening on :${port}/v1 (upstream: ${process.env.SIDECAR_UPSTREAM_URL || 'https://api.deepseek.com'})`);
}

bootstrap().catch((err) => {
  console.error('[Sidecar] failed to start:', err);
  process.exit(1);
});
