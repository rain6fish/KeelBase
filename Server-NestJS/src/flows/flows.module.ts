import { Module, OnModuleInit } from '@nestjs/common';
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

/**
 * FLOW 工作流引擎（护栏优先混合编排 v1）。
 * 启动时注册内建流程定义（leave_approval 审批场景）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([FlowDefinition, FlowInstance, FlowTask]),
    AiModule,
    NotificationsModule,
  ],
  controllers: [FlowController],
  providers: [FlowRuntimeService, AiFlowService],
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
        this.configService.get('NODE_ENV') === 'development' &&
          console.warn(`FLOW: 注册流程定义 ${def.id} 失败: ${e.message}`);
      });
    }
  }
}
