import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSession } from '../auth/user-session.entity';
import { PhoneVerificationCode } from '../auth/phone-verification-code.entity';
import { User } from '../common/entities/user.entity';
import { Event } from '../events/event.entity';
import { Todo } from '../todos/todo.entity';
import { Notification } from '../notifications/notification.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { LlmProviderFactory } from '../ai/providers/provider-factory';
import { LlmProviderConfig } from '../ai/interfaces/provider-config.interface';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { MaintenanceTasksService } from './maintenance-tasks.service';
import { ProactiveAiService } from './proactive-ai.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      UserSession,
      PhoneVerificationCode,
      User,
      Event,
      Todo,
      Notification,
    ]),
    NotificationsModule,
  ],
  providers: [
    MaintenanceTasksService,
    ProactiveAiService,
    {
      provide: LlmProviderFactory,
      useFactory: (configService: ConfigService, circuitBreaker: CircuitBreakerService) => {
        const factory = new LlmProviderFactory(circuitBreaker);
        const registerProvider = (name: string, baseURL: string, defaultModel: string) => {
          const key = name.toUpperCase();
          const apiKey = configService.get<string>(`${key}_API_KEY`);
          if (!apiKey) return;
          const config: LlmProviderConfig = {
            name,
            displayName: name,
            baseURL: configService.get<string>(`${key}_BASE_URL`, baseURL),
            apiKey,
            defaultModel: configService.get<string>('AI_CHAT_MODEL', defaultModel),
            availableModels: [defaultModel],
            maxTokens: configService.get<number>('AI_MAX_TOKENS', 4096),
            temperature: configService.get<number>('AI_TEMPERATURE', 0.7),
          };
          factory.register(config);
        };
        registerProvider('deepseek', 'https://api.deepseek.com', 'deepseek-v4-flash');
        registerProvider('qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-max');
        registerProvider('openai', 'https://api.openai.com/v1', 'gpt-4o-mini');
        return factory;
      },
      inject: [ConfigService, CircuitBreakerService],
    },
  ],
})
export class MaintenanceTasksModule {}
