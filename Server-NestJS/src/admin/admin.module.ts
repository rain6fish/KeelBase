import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../common/entities/user.entity';
import { Event } from '../events/event.entity';
import { Todo } from '../todos/todo.entity';
import { Notification } from '../notifications/notification.entity';
import { UserSession } from '../auth/user-session.entity';
import { OperationAuditLog } from '../operation-audit/operation-audit-log.entity';
import { AiAuditLog } from '../ai/audit/ai-audit-log.entity';
import { AiConversation } from '../ai/conversation/ai-conversation.entity';
import { KnowledgeArticle } from '../ai/rag/knowledge-article.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { MetricsModule } from '../metrics/metrics.module';
import { QueueModule } from '../queue/queue.module';
import { EncryptionModule } from '../common/utils/encryption.module';
import { CacheModule } from '../common/cache/cache.module';
import { AiModule } from '../ai/ai.module';
import { AdminAiController } from './admin-ai.controller';
import { AdminAiService } from './admin-ai.service';
import { AppVersionModule } from '../app-version/app-version.module';
import { HeadlessModule } from '../headless/headless.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Event,
      Todo,
      Notification,
      UserSession,
      OperationAuditLog,
      AiAuditLog,
      AiConversation,
      KnowledgeArticle,
    ]),
    NotificationsModule,
    MetricsModule,
    QueueModule.register(),
    EncryptionModule,
    CacheModule,
    AiModule,
    AppVersionModule,
    HeadlessModule,
  ],
  controllers: [AdminController, AdminAiController],
  providers: [AdminService, AdminAiService],
})
export class AdminModule {}
