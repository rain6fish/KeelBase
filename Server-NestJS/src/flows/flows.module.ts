// SPDX-License-Identifier: Apache-2.0

import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FlowDefinition } from './entities/flow-definition.entity';
import { FlowInstance } from './entities/flow-instance.entity';
import { FlowTask } from './entities/flow-task.entity';
import { FlowRuntimeService } from './flow-runtime.service';
import { AiFlowService } from './ai-flow.service';
import { FlowController } from './flow.controller';
import { DEFAULT_FLOW_DEFINITIONS } from './default-definitions';
import { User } from '../common/entities/user.entity';
import { OrgMember } from '../org/org-member.entity';
import { LlmProviderFactory } from '../ai/providers/provider-factory';
import { LlmProviderConfig } from '../ai/interfaces/provider-config.interface';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

/**
 * FLOW 工作流引擎（护栏优先混合编排 v1）。
 * 启动时注册内建流程定义（leave_approval 审批场景）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([FlowDefinition, FlowInstance, FlowTask, User, OrgMember]),
    forwardRef(() => AiModule),
    NotificationsModule,
  ],
  controllers: [FlowController],
  providers: [
    FlowRuntimeService,
    AiFlowService,
    // FLOW AI 节点自供 LLM 工厂（与 maintenance-tasks 同模式，避免改 AiService 组装）
    {
      provide: LlmProviderFactory,
      useFactory: (configService: ConfigService, circuitBreaker: CircuitBreakerService) => {
        const factory = new LlmProviderFactory(circuitBreaker);
        const registerProvider = (name: string, defaults: Partial<LlmProviderConfig> & { displayName: string }) => {
          const key = name.toUpperCase();
          const apiKey = configService.get<string>(`${key}_API_KEY`);
          if (!apiKey) return false;
          const config: LlmProviderConfig = {
            name,
            displayName: defaults.displayName,
            baseURL: configService.get<string>(`${key}_BASE_URL`, defaults.baseURL ?? ''),
            apiKey,
            defaultModel: configService.get<string>('AI_CHAT_MODEL', defaults.defaultModel ?? ''),
            availableModels: defaults.availableModels ?? [],
            maxTokens: configService.get<number>('AI_MAX_TOKENS', 4096),
            temperature: configService.get<number>('AI_TEMPERATURE', 0.7),
          };
          factory.register(config);
          return true;
        };
        registerProvider('deepseek', {
          displayName: 'DeepSeek',
          baseURL: 'https://api.deepseek.com',
          defaultModel: 'deepseek-v4-flash',
          availableModels: ['deepseek-v4-flash', 'deepseek-v4-pro'],
        });
        registerProvider('qwen', {
          displayName: '通义千问',
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          defaultModel: 'qwen-max',
          availableModels: ['qwen-max', 'qwen-plus'],
        });
        registerProvider('openai', {
          displayName: 'OpenAI',
          baseURL: 'https://api.openai.com/v1',
          defaultModel: 'gpt-4o-mini',
          availableModels: ['gpt-4o-mini', 'gpt-4o'],
        });
        const ollamaBase = configService.get<string>('OLLAMA_BASE_URL', '');
        if (ollamaBase) {
          const ollamaModel = configService.get<string>('OLLAMA_MODEL', 'qwen2.5:7b');
          factory.register({
            name: 'ollama',
            displayName: '本地 Ollama',
            baseURL: `${ollamaBase.replace(/\/+$/, '')}/v1`,
            apiKey: 'ollama',
            defaultModel: configService.get<string>('AI_CHAT_MODEL', ollamaModel),
            availableModels: [ollamaModel],
            maxTokens: configService.get<number>('AI_MAX_TOKENS', 4096),
            temperature: configService.get<number>('AI_TEMPERATURE', 0.7),
          });
        }
        return factory;
      },
      inject: [ConfigService, CircuitBreakerService],
    },
  ],
  exports: [FlowRuntimeService, AiFlowService],
})
export class FlowsModule implements OnModuleInit {
  constructor(
    private readonly runtime: FlowRuntimeService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const def of DEFAULT_FLOW_DEFINITIONS) {
      await this.runtime.upsertDefinition(def).catch((e) => {
        // 启动阶段失败仅告警，不阻断（如定义已存在冲突）
        if (this.configService.get('NODE_ENV') === 'development') {
          console.warn(`FLOW: 注册流程定义 ${def.id} 失败: ${e.message}`);
        }
      });
    }
  }
}
