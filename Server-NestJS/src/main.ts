// 必须第一个 import：OpenTelemetry 需要在 http/express 模块加载前 patch
import './tracing-init';
import { NestFactory } from '@nestjs/core';
import { VersioningType, Logger as NestLogger } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { join } from 'path';
import { LOCAL_UPLOAD_DIR } from './storage/local-storage.service';
import { UploadSignService } from './upload/upload-sign.service';

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

  // CR-21：/uploads 文件访问控制——签名 URL 校验后才放行（渐进模式默认放行，UPLOAD_REQUIRE_SIGN=1 强制）
  const uploadSign = app.get(UploadSignService);
  const requireSign = process.env.UPLOAD_REQUIRE_SIGN === '1';
  app.use('/uploads', (req: Request, res: Response, next: NextFunction) => {
    const filename = (req.path || '').replace(/^\/+/, '');
    // 防路径穿越：上传文件名是单层 `时间戳-随机.ext`，拒绝任何子路径/.. /\
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(403).json({ code: 403, message: 'Forbidden' });
    }
    const pathname = `/uploads/${filename}`;
    const e = (req.query.e as string) || '';
    const s = (req.query.s as string) || '';
    if (!uploadSign.verify(pathname, e, s)) {
      if (requireSign) {
        return res.status(403).json({ code: 403, message: 'Forbidden' });
      }
      // 渐进模式：放行但记日志，观察裸 URL 访问面
      logger.warn(`[uploads] unsigned access (progressive mode): ${pathname}`);
    }
    res.sendFile(join(LOCAL_UPLOAD_DIR, filename), (err: Error | undefined) => {
      if (err) next(err);
    });
  });

  // EASY-1 单容器交付：当 public/ 目录存在（Dockerfile.single 内嵌前端）时，
  // 用 Nest 托管 Web 工作台（根路径 → /admin/#/workbench）+ 移动主 App 预览（/mobile）+ 管理台（/admin），
  // 使 `docker run` 单容器即可提供全栈，无需 nginx。SERVE_STATIC 显式开启。
  // 端定位（2026-08-17）：Web 业务 UI 唯一宿主 = 工作台；Flutter web 仅作移动预览。
  if (process.env.SERVE_STATIC === '1') {
    const publicDir = join(__dirname, '..', 'public');
    const adminDir = join(publicDir, 'admin');
    const mobileDir = join(publicDir, 'mobile');
    // 根路径 → 工作台（Vue hash 路由，/admin/#/workbench 为工作台首页）
    app.getHttpAdapter().get('/', (req: any, res: any) => res.redirect('/admin/#/workbench'));
    // 移动主 App 预览（Flutter web，hash 路由无需 SPA fallback）→ /mobile/
    app.useStaticAssets(mobileDir, { prefix: '/mobile' });
    // 管理台 + 工作台（Web-Admin-Vue Vue3 独立构建，/admin 子路径）
    app.useStaticAssets(adminDir, { prefix: '/admin' });
    logger.log('Serving workbench (root → /admin/#/workbench) + mobile preview (/mobile) + admin console');
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

  // RG-6 WebSocket 双向通道（原生 ws，/ws）
  app.useWebSocketAdapter(new WsAdapter(app));

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
    console.log('     普通用户  alex / Alex@2026$Demo');
    console.log('     管理员    admin / Admin@2026$KeelBase');
    console.log('');
    console.log('   下一步：跑前端 `flutter run -d chrome`，或见 docs/manual/quickstart.md');
    console.log('  ═══════════════════════════════════════════════════');
    console.log('');
  }
}
bootstrap();
