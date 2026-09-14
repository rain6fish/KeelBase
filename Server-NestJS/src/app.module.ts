// SPDX-License-Identifier: Apache-2.0

import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { EventsModule } from './events/events.module';
import { TodosModule } from './todos/todos.module';
import { ContractsModule } from './contracts/contracts.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TagsModule } from './tags/tags.module';
import { NotesModule } from './notes/notes.module';
import { FlowsModule } from './flows/flows.module';
import { BooksModule } from './books/books.module';
import { PostsModule } from './posts/posts.module';
import { OrgModule } from './org/org.module';
import { PointsModule } from './points/points.module';
import { CrmModule } from './crm/crm.module';
import { PmModule } from './pm/pm.module';
import { ApprovalModule } from './approval/approval.module';

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
import { McpModule } from './mcp/mcp.module';
import { WebhookModule } from './webhooks/webhook.module';
import { RealtimeModule } from './realtime/realtime.module';
import { envValidationSchema } from './config/env.config';
import { createLoggerOptions } from './config/logging';
import { buildTypeOrmOptions } from './config/typeorm-options';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // G2-3①：环境文件解析。
      // - development（或未设 NODE_ENV）→ ['.env.development', '.env']：缺 .env.development 时回退 .env，
      //   避免「显式设 NODE_ENV=development 反而读不到随仓的 .env → JWT_SECRET 校验崩」的地雷。
      // - staging / production / test → 只读 `.env.<env>`（不静默回退到 .env，防开发密钥进生产；
      //   纯 env-var 部署（Docker）无文件时由进程环境变量提供，ConfigModule 跳过缺失文件即可）。
      envFilePath:
        !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
          ? ['.env.development', '.env']
          : `.env.${process.env.NODE_ENV}`,
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{
      // 3.4 压测/大促可经 THROTTLE_LIMIT/TTL 放宽；默认 60/min
      ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
      limit: parseInt(process.env.THROTTLE_LIMIT || '60', 10),
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
    ContractsModule,
    SuppliersModule,
    TagsModule,
    NotesModule,
    FlowsModule,
    BooksModule,
    PostsModule,
    OrgModule,
    PointsModule,
    CrmModule,
    PmModule,
    ApprovalModule,

    UploadModule,
    NotificationsModule,
    AiModule,
    McpModule,
    WebhookModule,
    MetricsModule,
    CaslModule,
    EncryptionModule,
    MailModule,
    SearchModule,
    OperationAuditModule,
    PushModule,
    CacheModule,
    AppVersionModule,
    QueueModule.register(),
    PushWorkerModule.register(),
    ReminderWorkerModule.register(),
    KnowledgeWorkerModule.register(),
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
    RealtimeModule,
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
