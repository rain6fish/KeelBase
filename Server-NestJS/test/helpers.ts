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
import * as path from 'path';
import { AuthModule } from '../src/auth/auth.module';
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
            migrations: [
              'dist/migrations/*PostgresInitialSchema*.js',
              'dist/migrations/*AddKnowledgeEmbeddings*.js',
            ],
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
          database: configService.get<string>('DB_PATH', './data/test.sqlite'),
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

// 测试环境配置：ConfigModule 只从 .env.test 读值（@nestjs/config v4 对 process.env 的同名键不生效）。
// 该文件被 .gitignore 排除、CI 缺失 → QUEUE_ENABLED/CACHE_ENABLED 走 Joi 默认 true → 无 Redis 时
// BullMQ pushQueue.add 阻塞重试导致 e2e 挂起（CI 上曾广播 >120s 超时 + app.close 挂起）。
// 缺失时生成，保证本地/CI 一致（CI 的 env 块会覆盖 JWT_SECRET/ENCRYPTION_KEY/DB_PATH）。
const TEST_ENV_CONTENT = `# 测试环境配置（createTestApp 缺失时自动生成，不入库）
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

export async function createTestApp(): Promise<INestApplication> {
  // Ensure a fresh database for each test run
  const testDbPath = path.resolve(__dirname, '../data/test.sqlite');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
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
