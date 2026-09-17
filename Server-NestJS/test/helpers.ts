// SPDX-License-Identifier: Apache-2.0

import { Module, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AuthModule } from '../src/auth/auth.module';
import { POSTGRES_MIGRATION_GLOBS } from '../src/config/postgres-migrations';
import { UsersModule } from '../src/users/users.module';
import { HealthModule } from '../src/health/health.module';
import { EventsModule } from '../src/events/events.module';
import { TodosModule } from '../src/todos/todos.module';
import { UploadModule } from '../src/upload/upload.module';
import { AiModule } from '../src/ai/ai.module';
import { MetricsModule } from '../src/metrics/metrics.module';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { MailModule } from '../src/mail/mail.module';
import { SearchModule } from '../src/search/search.module';
import { OperationAuditModule } from '../src/operation-audit/operation-audit.module';
import { OperationAuditInterceptor } from '../src/operation-audit/operation-audit.interceptor';
import { applyRequestContext } from '../src/common/request-context';
import { PushModule } from '../src/push/push.module';
import { AppVersionModule } from '../src/app-version/app-version.module';
import { AdminModule } from '../src/admin/admin.module';
import { SmsModule } from '../src/sms/sms.module';
import { SettingsModule } from '../src/settings/settings.module';
import { CircuitBreakerModule } from '../src/circuit-breaker/circuit-breaker.module';
import { HeadlessModule } from '../src/headless/headless.module';
import { McpModule } from '../src/mcp/mcp.module';
import { RealtimeModule } from '../src/realtime/realtime.module';
import { CrmModule } from '../src/crm/crm.module';
import { PmModule } from '../src/pm/pm.module';
import { ApprovalModule } from '../src/approval/approval.module';
import { SuppliersModule } from '../src/suppliers/suppliers.module';
import { BooksModule } from '../src/books/books.module';
import { NotesModule } from '../src/notes/notes.module';
import { FormBuilderModule } from '../src/form-builder/form-builder.module';
import { PointsModule } from '../src/points/points.module';
import { WebhookModule } from '../src/webhooks/webhook.module';
import { FeedbackModule } from '../src/feedback/feedback.module';
import { DataImportModule } from '../src/data-import/data-import.module';
import { WsAdapter } from '@nestjs/platform-ws';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { EmailVerificationGuard } from '../src/auth/guards/email-verification.guard';
import { PoliciesGuard } from '../src/common/casl/policies.guard';
import { CaslModule } from '../src/common/casl/casl.module';
import { EncryptionModule } from '../src/common/utils/encryption.module';
import { envValidationSchema } from '../src/config/env.config';
import request from 'supertest';

/**
 * 测试环境配置：ConfigModule 只从 .env.test 读值（@nestjs/config v4 对 process.env 的同名键不生效）。
 * 该文件被 .gitignore 排除、CI 缺失 → QUEUE_ENABLED/CACHE_ENABLED 走 Joi 默认 true → 无 Redis 时
 * BullMQ pushQueue.add 阻塞重试导致 e2e 挂起（CI 上曾广播 >120s 超时 + app.close 挂起）。
 */
const TEST_ENV_CONTENT = `# 测试环境配置（自动生成，不入库）
NODE_ENV=test
PORT=3001
JWT_SECRET=test-jwt-secret-at-least-32-characters!!
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=test-refresh-secret-at-least-32-chars!!
JWT_REFRESH_EXPIRES_IN=7d
DB_TYPE=sqlite
DB_PATH=./data/test.sqlite
LOCKOUT_THRESHOLD=10
LOCKOUT_DURATION=15
ENCRYPTION_KEY=e640ea00aa5e1e0425b174fdbd2c56cd07c56b7f12daa57a6180bce226bcb1c4
ENCRYPTION_HMAC_KEY=c6c1385a82395cafcfc856f775e1fb54efd985aa628869e2652d86f500b84bfd
AUDIT_HMAC_KEY=00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff
MAIL_ENABLED=false
STORAGE_DRIVER=local
CACHE_ENABLED=false
QUEUE_ENABLED=false
`;

function ensureTestEnvFile(): void {
  const testEnvPath = path.resolve(__dirname, '../.env.test');
  if (fs.existsSync(testEnvPath)) return;
  fs.writeFileSync(testEnvPath, TEST_ENV_CONTENT, 'utf8');
}

// **必须在 @Module 之前调用**：下方 ConfigModule.forRoot 在**模块加载期**（装饰器求值）就读 .env.test 并跑
// Joi 校验；若等到 createTestApp 才生成，全新检出（clone 后无 .env.test；CI 靠 workflow 注入 env 掩盖）
// 会直接抛「JWT_SECRET is required」——且是否触发取决于哪个 e2e 套件先加载 helpers（不稳定）。此处提前落盘。
ensureTestEnvFile();

/**
 * 每个 app 一个**独立**库文件，且**从不 unlink**。
 *
 * 原先每个 app 都先把共用的 `data/test.sqlite` 删掉再建——单跑无碍，**并行跑就出事**（多会话在
 * 同一个检出上各跑各的 e2e 是这里的常态）：一个运行会把另一个**正在用**的库删掉重建，实测表现为
 * 整片 `expected 201, got 401`（另一运行把用户抹了）与 `database is locked`；Windows 上还会因
 * 「删一个仍被打开的文件」直接 `EBUSY`（POSIX 允许 unlink 打开中的文件，故 CI 在 Linux 上一直是绿的
 * ——这是**本地红、CI 绿**的错位）。
 *
 * 文件名带 pid + 递增序号：同进程内多套不撞、跨进程（并发运行）也不撞。放在系统临时目录，
 * 既不往 `data/` 里堆，也不再有「删到别人正在用的文件」这条路。
 */
let e2eDbSeq = 0;
function nextE2eDbPath(): string {
  e2eDbSeq += 1;
  return path.join(os.tmpdir(), `keelbase-e2e-${process.pid}-${e2eDbSeq}.sqlite`);
}

/**
 * Test app module — mirrors AppModule (all modules) with a
 * test-friendly throttle limit and a fresh SQLite database.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env.test',
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbType = configService.get<string>('DB_TYPE', 'sqlite');
        const nodeEnv = configService.get<string>('NODE_ENV', 'development');
        const isDev = nodeEnv === 'development';

        if (dbType === 'postgres') {
          return {
            type: 'postgres' as const,
            autoLoadEntities: true,
            synchronize: isDev,
            logging: ['error', 'warn'],
            // 单一权威清单（src/config/postgres-migrations.ts）——勿在此复制第二份列表
            migrations: POSTGRES_MIGRATION_GLOBS.map(
              (g) => `dist/migrations/${g}.js`,
            ),
            migrationsRun: false,
            host: configService.get<string>('DB_HOST', 'localhost'),
            port: configService.get<number>('DB_PORT', 5432),
            username: configService.get<string>('DB_USER', 'postgres'),
            password: configService.get<string>('DB_PASSWORD', 'postgres'),
            database: configService.get<string>('DB_NAME', 'front'),
          } satisfies TypeOrmModuleOptions;
        }

        return {
          type: 'better-sqlite3' as const,
          autoLoadEntities: true,
          synchronize: true, // create tables from scratch in tests
          logging: ['error', 'warn'],
          migrations: ['dist/migrations/*.js'],
          migrationsRun: false,
          // 每 app 独立库（见 nextE2eDbPath）：不再读 .env.test 的 DB_PATH —— 固定路径是并行互毁的根源
          database: nextE2eDbPath(),
        } satisfies TypeOrmModuleOptions;
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }]),
    // 测试环境日志静默
    LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
    AuthModule,
    UsersModule,
    HealthModule,
    EventsModule,
    TodosModule,
    UploadModule,
    AiModule,
    MetricsModule,
    CaslModule,
    EncryptionModule,
    NotificationsModule,
    MailModule,
    SearchModule,
    OperationAuditModule,
    PushModule,
    AppVersionModule,
    AdminModule,
    SmsModule,
    SettingsModule,
    CircuitBreakerModule,
    HeadlessModule,
    McpModule,
    RealtimeModule,
    CrmModule,
    PmModule,
    ApprovalModule,
    SuppliersModule,
    BooksModule,
    NotesModule,
    FormBuilderModule,
    PointsModule,
    WebhookModule,
    FeedbackModule,
    DataImportModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: EmailVerificationGuard },
    { provide: APP_GUARD, useClass: PoliciesGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: OperationAuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: false },
        }),
    },
  ],
})
class TestAppModule {}

export async function createTestApp(): Promise<INestApplication> {
  // 无需清库：每个 app 拿到一个独立的新库文件（见 nextE2eDbPath）。删共用文件正是并行运行互毁
  // 数据、以及 Windows 上 EBUSY 的根源，故这里**不做任何 unlink**。
  ensureTestEnvFile();

  // 队列 override 为 stub：无论 QUEUE_ENABLED/config 状态如何，pushQueue.add 立即返回，
  // 测试环境永不建立 Redis 连接（无 Redis 时 BullMQ add 会阻塞重试导致 e2e 挂起）。
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [TestAppModule],
  })
    .overrideProvider(getQueueToken('push')).useValue({ add: jest.fn(async () => ({})) })
    .overrideProvider(getQueueToken('reminder')).useValue({ add: jest.fn(async () => ({})) })
    .overrideProvider(getQueueToken('knowledge')).useValue({ add: jest.fn(async () => ({})) })
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // RG-6：WS 网关（init 前挂 adapter；supertest 走 app.getHttpServer() 不受影响）
  app.useWebSocketAdapter(new WsAdapter(app));
  // AU-2/AU-3（§22.19）：请求级归因元数据中间件。**必须**在测试里也挂——本函数不经过 main.ts 的
  // bootstrap，此前该中间件只内联在那里 → 测试中缺失，ip/guestId 永远取不到，且不为测试所察。
  // 复用同一函数（单一真源），避免再次漂移。此处不设 trust proxy：supertest 直连，Express 默认不信任 ✓
  applyRequestContext(app);
  await app.init();
  return app;
}

export async function registerUser(
  app: INestApplication,
  user: { username: string; email: string; password: string; nickname: string },
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send(user)
    .expect(201);
  const token = res.body.data.accessToken;
  // 默认视为已验证邮箱，避免新守卫拦截常规测试写操作；
  // 守卫专项测试在 describe 内显式置 emailVerified=false。
  const me = await request(app.getHttpServer())
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const ds = app.get(DataSource);
  await ds.getRepository('users').update(me.body.data.id, { emailVerified: true });
  return {
    accessToken: token,
    refreshToken: res.body.data.refreshToken,
  };
}

export async function loginAs(
  app: INestApplication,
  username: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username, password })
    .expect(200);
  return {
    accessToken: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
  };
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
