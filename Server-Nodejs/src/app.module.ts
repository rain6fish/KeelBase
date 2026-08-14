import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { EventsModule } from './events/events.module';
import { TodosModule } from './todos/todos.module';
import { NotesModule } from './notes/notes.module';
import { BooksModule } from './books/books.module';
import { PostsModule } from './posts/posts.module';

import { UploadModule } from './upload/upload.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MetricsModule } from './metrics/metrics.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { EmailVerificationGuard } from './auth/guards/email-verification.guard';
import { PoliciesGuard } from './common/casl/policies.guard';
import { CaslModule } from './common/casl/casl.module';
import { EncryptionModule } from './common/utils/encryption.module';
import { AiModule } from './ai/ai.module';
import { MailModule } from './mail/mail.module';
import { SearchModule } from './search/search.module';
import { OperationAuditModule } from './operation-audit/operation-audit.module';
import { OperationAuditInterceptor } from './operation-audit/operation-audit.interceptor';
import { PushModule } from './push/push.module';
import { CacheModule } from './common/cache/cache.module';
import { QueueModule } from './queue/queue.module';
import { PushWorkerModule } from './queue/push-worker.module';
import { ReminderWorkerModule } from './queue/reminder-worker.module';
import { KnowledgeWorkerModule } from './queue/knowledge-worker.module';
import { AppVersionModule } from './app-version/app-version.module';
import { AdminModule } from './admin/admin.module';
import { SmsModule } from './sms/sms.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { FeatureDisabledGuard } from './feature-flags/feature-disabled.guard';
import { MaintenanceTasksModule } from './maintenance-tasks/maintenance-tasks.module';
import { FeedbackModule } from './feedback/feedback.module';
import { HeadlessModule } from './headless/headless.module';
import { TemplatesModule } from './templates/templates.module';
import { MarketingModule } from './marketing/marketing.module';
import { FormBuilderModule } from './form-builder/form-builder.module';
import { PluginsModule } from './plugins/plugins.module';
import { DataImportModule } from './data-import/data-import.module';
import { SettingsModule } from './settings/settings.module';
import { MaintenanceGuard } from './settings/maintenance.guard';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';
import { AlertWebhookModule } from './alert-webhook/alert-webhook.module';
import { envValidationSchema } from './config/env.config';
import { createLoggerOptions } from './config/logging';
import { createTypeOrmLogger } from './common/tracing/typeorm-tracing.logger';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV
        ? `.env.${process.env.NODE_ENV}`
        : '.env',
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbType = configService.get<string>('DB_TYPE', 'sqlite');
        const nodeEnv = configService.get<string>('NODE_ENV', 'development');
        const isDev = nodeEnv === 'development';
        // 单容器零配置：DB_SYNCHRONIZE=true 时用 synchronize（seed-demo 已建表，幂等），跳过迁移避免冲突
        const useSync = configService.get<string>('DB_SYNCHRONIZE', 'false') === 'true';

        if (dbType === 'postgres') {
          const otelOn = configService.get<string>('OTEL_ENABLED', 'false') === 'true';
          return {
            type: 'postgres' as const,
            autoLoadEntities: true,
            synchronize: isDev || useSync,
            logging: otelOn ? ['query', 'error'] : ['error', 'warn', 'schema'],
            logger: createTypeOrmLogger(otelOn),
            // postgres 用独立基线 + 向量迁移（sqlite 方言迁移不加载）
            migrations: [
              'dist/migrations/*PostgresInitialSchema*.js',
              'dist/migrations/*AddKnowledgeEmbeddings*.js',
              'dist/migrations/*AddOperationAuditFeatureColumns*.js',
              'dist/migrations/*AddAccountCompliance*.js',
              'dist/migrations/*AddUserMemory*.js',
              'dist/migrations/*AddConversationSummary*.js',
              'dist/migrations/*AddKnowledgeDocumentColumns*.js',
              'dist/migrations/*AddKnowledgeChunks*.js',
              'dist/migrations/*AddSettings*.js',
              'dist/migrations/*AddSoftDelete*.js',
              'dist/migrations/*AddAiFeedback*.js',
              'dist/migrations/*AddInvite*.js',
              'dist/migrations/*AddAiEvalCases*.js',
              'dist/migrations/*AddFormBuilder*.js',
              'dist/migrations/*AddAiToolSideEffects*.js',
              'dist/migrations/*AddHeadlessApiKeys*.js',
              'dist/migrations/*AddGeneratedModuleSchemas*.js',

            ],
            migrationsRun: !isDev && !useSync,
            host: configService.get<string>('DB_HOST', 'localhost'),
            port: configService.get<number>('DB_PORT', 5432),
            username: configService.get<string>('DB_USER', 'postgres'),
            password: configService.get<string>('DB_PASSWORD', 'postgres'),
            database: configService.get<string>('DB_NAME', 'front'),
            extra: {
              max: configService.get<number>('DB_POOL_MAX', 20),
              min: configService.get<number>('DB_POOL_MIN', 5),
              idleTimeoutMillis: configService.get<number>('DB_POOL_IDLE_TIMEOUT', 30000),
              connectionTimeoutMillis: configService.get<number>('DB_POOL_CONNECTION_TIMEOUT', 2000),
            },
          } satisfies TypeOrmModuleOptions;
        }

        const otelOn = configService.get<string>('OTEL_ENABLED', 'false') === 'true';
        return {
          type: 'better-sqlite3' as const,
          autoLoadEntities: true,
          synchronize: isDev || useSync,
          logging: otelOn ? ['query', 'error'] : ['error', 'warn', 'schema'],
          logger: createTypeOrmLogger(otelOn),
          migrations: ['dist/migrations/*.js'],
          migrationsRun: !isDev && !useSync,
          database: configService.get<string>('DB_PATH', './data/front.sqlite'),
        } satisfies TypeOrmModuleOptions;
      },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60,
    }]),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createLoggerOptions,
    }),
    AuthModule,
    UsersModule,
    HealthModule,
    EventsModule,
    TodosModule,
    NotesModule,
    BooksModule,
    PostsModule,

    UploadModule,
    NotificationsModule,
    AiModule,
    MetricsModule,
    CaslModule,
    EncryptionModule,
    MailModule,
    SearchModule,
    OperationAuditModule,
    PushModule,
    CacheModule,
    AppVersionModule,
    QueueModule,
    PushWorkerModule,
    ReminderWorkerModule,
    KnowledgeWorkerModule,
    AdminModule,
    SmsModule,
    FeatureFlagsModule,
    MaintenanceTasksModule,
    SettingsModule,
    CircuitBreakerModule,
    AlertWebhookModule,
    FeedbackModule,
    HeadlessModule,
    TemplatesModule,
    MarketingModule,
    FormBuilderModule,
    PluginsModule,
    DataImportModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: FeatureDisabledGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: MaintenanceGuard },
    { provide: APP_GUARD, useClass: EmailVerificationGuard },
    { provide: APP_GUARD, useClass: PoliciesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
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
          transformOptions: {
            enableImplicitConversion: false,
          },
        }),
    },
  ],
})
export class AppModule {}
