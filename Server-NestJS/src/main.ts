// 必须第一个 import：OpenTelemetry 需要在 http/express 模块加载前 patch
import './tracing-init';
import { NestFactory } from '@nestjs/core';
import { VersioningType, Logger as NestLogger } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json } from 'express';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  const logger = new NestLogger('Bootstrap');

  const nodeEnv = process.env.NODE_ENV || 'development';
  const isDev = nodeEnv === 'development';
  const isProd = nodeEnv === 'production';

  // CORS — allow specific origins in production
  const corsOrigins = process.env.CORS_ORIGINS || '*';
  const isWildcard = corsOrigins === '*';
  // DEP-7：生产环境拒绝「通配 + credentials」组合——通配时禁用 credentials，防任意源携带凭据
  const allowCredentials = !(isProd && isWildcard);
  if (isProd && isWildcard) {
    logger.warn('CORS_ORIGINS 为 *（通配）：已禁用 credentials（生产禁止通配+凭据组合）');
  }
   app.enableCors({
     origin: corsOrigins === '*' ? true : corsOrigins.split(',').map((s) => s.trim()),
     methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
     credentials: allowCredentials,
   });

  // Security headers
  app.use(helmet());

  // Body size limit — prevent large payload attacks
  app.use(json({ limit: '1mb' }));

  // API versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global route prefix
  app.setGlobalPrefix('api');

  // Serve uploaded files as static assets
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads',
  });

  // EASY-1 单容器交付：当 public/ 目录存在（Dockerfile.single 内嵌前端）时，
  // 用 Nest 托管 Flutter web 主 App（根路径）+ 管理台（/admin），
  // 使 `docker run` 单容器即可提供全栈，无需 nginx。SERVE_STATIC 显式开启。
  if (process.env.SERVE_STATIC === '1') {
    const publicDir = join(__dirname, '..', 'public');
    const adminDir = join(publicDir, 'admin');
    // 主 App（Flutter web，hash 路由无需 SPA fallback）
    app.useStaticAssets(publicDir);
    // 管理台（Web-Admin-Vue Vue3 独立构建，/admin 子路径）
    app.useStaticAssets(adminDir, { prefix: '/admin' });
    logger.log('Serving web + admin console from public/ (single-container mode)');
  }

  // Swagger docs — only in development
  if (isDev) {
    const config = new DocumentBuilder()
      .setTitle('KeelBase API')
      .setDescription('KeelBase backend API documentation (dev only)')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('Swagger docs enabled at /api/docs (dev only)');
  }

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Server running on http://localhost:${port} [${nodeEnv}]`);

  // 新手提示（dev 环境打印演示账号与访问地址，傻瓜化）
  if (isDev) {
    console.log('');
    console.log('  ═══════════════════════════════════════════════════');
    console.log(`   后端 API    http://localhost:${port}`);
    console.log(`   Swagger 文档 http://localhost:${port}/api/docs`);
    console.log('');
    console.log('   演示账号：');
    console.log('     普通用户  alex / 123456');
    console.log('     管理员    admin / Admin@1234');
    console.log('');
    console.log('   下一步：跑前端 `flutter run -d chrome`，或见 docs/manual/quickstart.md');
    console.log('  ═══════════════════════════════════════════════════');
    console.log('');
  }
}
bootstrap();
