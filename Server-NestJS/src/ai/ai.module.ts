/**
 * AI 模块
 *
 * 注册 AI 对话、工具调用、数据洞察等能力。
 * 使用 TypeORM 持久化对话和审计日志。
 */

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventsModule } from '../events/events.module';
import { UsersModule } from '../users/users.module';
import { TodosModule } from '../todos/todos.module';
import { TodosService } from '../todos/todos.service';
import { ContractsModule } from '../contracts/contracts.module';
import { ContractsService } from '../contracts/contracts.service';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
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
import { AiDailyUsage } from './audit/ai-daily-usage.entity';
import { QueryEventsTool } from './tools/query-events.tool';
import { CountEventsByStatusTool } from './tools/count-events-by-status.tool';
import { QueryUserStatsTool } from './tools/query-user-stats.tool';
import { QueryEventsByKeywordTool } from './tools/query-events-by-keyword.tool';
import { NavigatePageTool } from './tools/navigate-page.tool';
import { CreateEventTool } from './tools/create-event.tool';
import { CreateTodoTool } from './tools/create-todo.tool';
import { QueryContractsTool } from './tools/query-contracts.tool';
import { CreateContractTool } from './tools/create-contract.tool';
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
import { AiToolSideEffect } from './tool-effects/ai-tool-side-effect.entity';
import { AiToolEffectsService } from './tool-effects/ai-tool-effects.service';
import { GovernancePolicyService } from './governance/governance-policy.service';
import { AuditChainModule } from '../common/audit-chain/audit-chain.module';
import { OrgModule } from '../org/org.module';
import { OrgService } from '../org/org.service';
import { QueryOrgAvailabilityTool } from './tools/query-org-availability.tool';
import { QueryOrgMembersTool } from './tools/query-org-members.tool';
import { QueryOrgTasksTool } from './tools/query-org-tasks.tool';
import { QueryCustomersTool } from './tools/query-customers.tool';
import { QueryCustomerOrdersTool } from './tools/query-customer-orders.tool';
import { QueryCustomerActivitiesTool } from './tools/query-customer-activities.tool';
import { AnalyzeCustomerRiskTool } from './tools/analyze-customer-risk.tool';
import { CreateFollowupTaskTool } from './tools/create-followup-task.tool';
import { QueryProjectsTool } from './tools/query-projects.tool';
import { QueryProjectTasksTool } from './tools/query-project-tasks.tool';
import { AnalyzeProjectRiskTool } from './tools/analyze-project-risk.tool';
import { CreateProjectTaskTool } from './tools/create-project-task.tool';
import { CrmModule } from '../crm/crm.module';
import { CrmService } from '../crm/crm.service';
import { PmModule } from '../pm/pm.module';
import { PmService } from '../pm/pm.service';
import { QueryApprovalRequestsTool } from './tools/query-approval-requests.tool';
import { QueryApprovalPoliciesTool } from './tools/query-approval-policies.tool';
import { SubmitApprovalRequestTool } from './tools/submit-approval-request.tool';
import { ReviewApprovalRequestTool } from './tools/review-approval-request.tool';
import { ApprovalModule } from '../approval/approval.module';
import { ApprovalService } from '../approval/approval.service';
import { SkillsRegistry, DEFAULT_SKILLS } from './skills/skills-registry';
import { SYSTEM_PROMPT } from './constants/system-prompt';
import { LlmProviderConfig } from './interfaces/provider-config.interface';
import { CaslAbilityFactory } from '../common/casl/casl-ability.factory';
import { SettingsService } from '../settings/settings.service';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => EventsModule),
    UsersModule,
    TodosModule,
    ContractsModule,
    // org→flows→ai→events→org 间接环：Org 侧需 forwardRef
    forwardRef(() => OrgModule),
    CrmModule,
    PmModule,
    ApprovalModule,
    QueueModule,
    StorageModule,
    FeatureFlagsModule,
    AuditChainModule,
    TypeOrmModule.forFeature([AiConversation, AiMessage, AiAuditLog, AiDailyUsage, KnowledgeArticle, UserMemory, EvalCase, AiToolSideEffect]),
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
    AiToolEffectsService,
    GovernancePolicyService,
    {
      provide: AiService,
      useFactory: (
        configService: ConfigService,
        eventsService: EventsService,
        usersService: UsersService,
        orgService: OrgService,
        conversationService: ConversationService,
        auditService: AuditService,
        knowledgeService: KnowledgeService,
        abilityFactory: CaslAbilityFactory,
        todosService: TodosService,
        contractsService: ContractsService,
        memoryService: MemoriesService,
        confirmationStore: ConfirmationStore,
        settingsService: SettingsService,
        circuitBreaker: CircuitBreakerService,
        featureFlagsService: FeatureFlagsService,
        toolEffectsService: AiToolEffectsService,
        governancePolicy: GovernancePolicyService,
        crmService: CrmService,
        pmService: PmService,
        approvalService: ApprovalService,
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
        // ORG-5 组织边界 AI 工具（仅返回请求用户所属组织的数据）
        toolRegistry.register(new QueryOrgAvailabilityTool(orgService, eventsService));
        toolRegistry.register(new QueryOrgMembersTool(orgService));
        toolRegistry.register(new QueryOrgTasksTool(orgService));
        toolRegistry.register(new NavigatePageTool());
        toolRegistry.register(new CreateEventTool(eventsService));
        toolRegistry.register(new CreateTodoTool(todosService));
        // 合同（EASY-2 自动生成 AI 工具：读 + 写需确认）
        toolRegistry.register(new QueryContractsTool(contractsService));
        toolRegistry.register(new CreateContractTool(contractsService));
        // AI-14 联网搜索（TAVILY_API_KEY 配置后启用，未配置降级）
        toolRegistry.register(new WebSearchTool(configService));
        // AI-12.1 图像生成（默认 provider 支持 images 端点时生效）
        toolRegistry.register(new GenerateImageTool(factory, defaultProvider));
        // AI CRM 旗舰应用：客户/订单/跟进/风险/创建跟进任务
        toolRegistry.register(new QueryCustomersTool(crmService));
        toolRegistry.register(new QueryCustomerOrdersTool(crmService));
        toolRegistry.register(new QueryCustomerActivitiesTool(crmService));
        toolRegistry.register(new AnalyzeCustomerRiskTool(crmService));
        toolRegistry.register(new CreateFollowupTaskTool(crmService));
        // AI Project Management 旗舰应用：项目/任务/风险/创建项目任务
        toolRegistry.register(new QueryProjectsTool(pmService));
        toolRegistry.register(new QueryProjectTasksTool(pmService));
        toolRegistry.register(new AnalyzeProjectRiskTool(pmService));
        toolRegistry.register(new CreateProjectTaskTool(pmService));
        // AI Approval 旗舰应用：审批请求/政策/提交/预审
        toolRegistry.register(new QueryApprovalRequestsTool(approvalService));
        toolRegistry.register(new QueryApprovalPoliciesTool(approvalService));
        toolRegistry.register(new SubmitApprovalRequestTool(approvalService));
        toolRegistry.register(new ReviewApprovalRequestTool(approvalService));

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
          featureFlagsService,
          usersService,
          toolEffectsService,
          governancePolicy,
        );
      },
      inject: [ConfigService, EventsService, UsersService, OrgService, ConversationService, AuditService, KnowledgeService, CaslAbilityFactory, TodosService, ContractsService, MemoriesService, ConfirmationStore, SettingsService, CircuitBreakerService, FeatureFlagsService, AiToolEffectsService, GovernancePolicyService, CrmService, PmService, ApprovalService],
    },
  ],
  exports: [ConversationService, AuditService, AiService, KnowledgeIngestionService, GovernancePolicyService],
})
export class AiModule {}
