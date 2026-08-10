/**
 * AI 模块
 *
 * 注册 AI 对话、工具调用、数据洞察等能力。
 * 使用 TypeORM 持久化对话和审计日志。
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventsModule } from '../events/events.module';
import { UsersModule } from '../users/users.module';
import { TodosModule } from '../todos/todos.module';
import { TodosService } from '../todos/todos.service';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { EventsService } from '../events/events.service';
import { UsersService } from '../users/users.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AuditController } from './audit/audit.controller';
import { InsightsController } from './insights/insights.controller';
import { InsightsService } from './insights/insights.service';
import { KnowledgeController } from './rag/knowledge.controller';
import { KnowledgeService } from './rag/knowledge.service';
import { KnowledgeArticle } from './rag/knowledge-article.entity';
import { RagAgent } from './agents/rag-agent.service';
import { EmbeddingsService } from './embeddings/embeddings.service';
import { LlmProviderFactory } from './providers/provider-factory';
import { ToolRegistry } from './tools/tool-registry';
import { ConversationService } from './conversation/conversation.service';
import { AuditService } from './audit/audit.service';
import { AiConversation } from './conversation/ai-conversation.entity';
import { AiMessage } from './conversation/ai-message.entity';
import { AiAuditLog } from './audit/ai-audit-log.entity';
import { QueryEventsTool } from './tools/query-events.tool';
import { CountEventsByStatusTool } from './tools/count-events-by-status.tool';
import { QueryUserStatsTool } from './tools/query-user-stats.tool';
import { QueryEventsByKeywordTool } from './tools/query-events-by-keyword.tool';
import { NavigatePageTool } from './tools/navigate-page.tool';
import { CreateEventTool } from './tools/create-event.tool';
import { CreateTodoTool } from './tools/create-todo.tool';
import { WebSearchTool } from './tools/web-search.tool';
import { GenerateImageTool } from './tools/generate-image.tool';
import { MemoriesService } from './memory/memory.service';
import { UserMemory } from './memory/user-memory.entity';
import { ConfirmationStore } from './confirmation/confirmation.store';
import { ConversationCompactor } from './conversation/conversation-compactor';
import { KnowledgeIngestionService } from './rag/knowledge-ingestion.service';
import { SubAgentOrchestrator } from './agents/sub-agent-orchestrator.service';
import { EvalCase } from './eval/eval-case.entity';
import { AiEvalService } from './eval/ai-eval.service';
import { AiEvalController } from './eval/ai-eval.controller';
import { SkillsRegistry, DEFAULT_SKILLS } from './skills/skills-registry';
import { SYSTEM_PROMPT } from './constants/system-prompt';
import { LlmProviderConfig } from './interfaces/provider-config.interface';
import { CaslAbilityFactory } from '../common/casl/casl-ability.factory';
import { SettingsService } from '../settings/settings.service';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

@Module({
  imports: [
    ConfigModule,
    EventsModule,
    UsersModule,
    TodosModule,
    QueueModule,
    StorageModule,
    TypeOrmModule.forFeature([AiConversation, AiMessage, AiAuditLog, KnowledgeArticle, UserMemory, EvalCase]),
  ],
  controllers: [AiController, AuditController, InsightsController, KnowledgeController, AiEvalController],
  providers: [
    ConversationService,
    AuditService,
    InsightsService,
    KnowledgeService,
    EmbeddingsService,
    KnowledgeIngestionService,
    MemoriesService,
    ConfirmationStore,
    AiEvalService,
    {
      provide: AiService,
      useFactory: (
        configService: ConfigService,
        eventsService: EventsService,
        usersService: UsersService,
        conversationService: ConversationService,
        auditService: AuditService,
        knowledgeService: KnowledgeService,
        abilityFactory: CaslAbilityFactory,
        todosService: TodosService,
        memoryService: MemoriesService,
        confirmationStore: ConfirmationStore,
        settingsService: SettingsService,
        circuitBreaker: CircuitBreakerService,
      ) => {
        // 1. 创建 Provider 工厂并注册 LLM 供应商
        const factory = new LlmProviderFactory(circuitBreaker);
        const defaultProvider = configService.get<string>('AI_PROVIDER', 'deepseek');

        const registerProvider = (name: string, defaults: Partial<LlmProviderConfig> & { displayName: string }) => {
          const key = name.toUpperCase();
          const apiKey = configService.get<string>(`${key}_API_KEY`);
          if (!apiKey) return false;

          const config: LlmProviderConfig = {
            name,
            displayName: defaults.displayName,
            baseURL: configService.get<string>(`${key}_BASE_URL`, defaults.baseURL ?? ''),
            apiKey,
            defaultModel: configService.get<string>(`AI_CHAT_MODEL`, defaults.defaultModel ?? ''),
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

        // POV-1 私有化 AI：Ollama 本地模型（无需 API Key，OLLAMA_BASE_URL 判定启用）
        // 数据不出域；AI_PROVIDER=ollama 时默认走本地，其余仍走云端（降级链）
        const ollamaBase = configService.get<string>('OLLAMA_BASE_URL', '');
        if (ollamaBase) {
          const ollamaModel = configService.get<string>('OLLAMA_MODEL', 'qwen2.5:7b');
          factory.register({
            name: 'ollama',
            displayName: '本地 Ollama',
            baseURL: `${ollamaBase.replace(/\/+$/, '')}/v1`,
            apiKey: 'ollama', // 本地无需真实 key，占位
            defaultModel: configService.get<string>('AI_CHAT_MODEL', ollamaModel),
            availableModels: [ollamaModel],
            maxTokens: configService.get<number>('AI_MAX_TOKENS', 4096),
            temperature: configService.get<number>('AI_TEMPERATURE', 0.7),
          });
        }

        // 2. 创建工具注册表
        const toolRegistry = new ToolRegistry();
        toolRegistry.register(new QueryEventsTool(eventsService));
        toolRegistry.register(new CountEventsByStatusTool(eventsService));
        toolRegistry.register(new QueryUserStatsTool(usersService, eventsService));
        toolRegistry.register(new QueryEventsByKeywordTool(eventsService));
        toolRegistry.register(new NavigatePageTool());
        toolRegistry.register(new CreateEventTool(eventsService));
        toolRegistry.register(new CreateTodoTool(todosService));
        // AI-14 联网搜索（TAVILY_API_KEY 配置后启用，未配置降级）
        toolRegistry.register(new WebSearchTool(configService));
        // AI-12.1 图像生成（默认 provider 支持 images 端点时生效）
        toolRegistry.register(new GenerateImageTool(factory, defaultProvider));

        // 3. 创建 RagAgent（依赖 KnowledgeService，同 ToolRegistry 模式手动组装）
        const ragAgent = new RagAgent(knowledgeService);

        // 4. 创建 ConversationCompactor（长对话上下文压缩，手动组装）
        const aiConfig = {
          defaultProvider,
          defaultModel: configService.get<string>('AI_CHAT_MODEL', 'deepseek-v4-flash'),
          systemPrompt: SYSTEM_PROMPT,
        };
        const compactor = new ConversationCompactor(factory, aiConfig, conversationService);

        // 4.1 创建 SubAgentOrchestrator（子代理委托 + Skills）
        const subAgentOrchestrator = new SubAgentOrchestrator(
          new SkillsRegistry(DEFAULT_SKILLS),
        );

        // 5. 创建 AiService（ConversationService 和 AuditService 由 NestJS 注入）
        return new AiService(
          factory,
          toolRegistry,
          conversationService,
          aiConfig,
          auditService,
          ragAgent,
          abilityFactory,
          memoryService,
          confirmationStore,
          compactor,
          subAgentOrchestrator,
          settingsService,
        );
      },
      inject: [ConfigService, EventsService, UsersService, ConversationService, AuditService, KnowledgeService, CaslAbilityFactory, TodosService, MemoriesService, ConfirmationStore, SettingsService, CircuitBreakerService],
    },
  ],
  exports: [ConversationService, AuditService, AiService, KnowledgeIngestionService],
})
export class AiModule {}
