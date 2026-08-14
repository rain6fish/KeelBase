import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../ai/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LlmProviderFactory } from '../ai/providers/provider-factory';
import type { AppAbility } from '../common/casl/casl-ability.factory';

import { FlowDefinition } from './entities/flow-definition.entity';
import { FlowInstance } from './entities/flow-instance.entity';
import { FlowTask } from './entities/flow-task.entity';
import { FlowNode, HumanTaskNode, FlowDefinition as FlowDef } from './flow-definition.types';
import { User } from '../common/entities/user.entity';
import { runHumanTask } from './node-registry/human-task.node';
import { runAiTask } from './node-registry/ai-task.node';
import { evalCondition } from './node-registry/condition.node';

/**
 * FLOW 运行时状态机（FLOW-3）：
 *   start → running → 节点分发（condition/ai_task 同步推进；human_task 建任务挂起）
 *   → resolveTask 推进 → completed / failed / rolled_back
 * 每节点执行落审计（action: 'flow_node'）。
 */
@Injectable()
export class FlowRuntimeService {
  constructor(
    @InjectRepository(FlowDefinition) private readonly defRepo: Repository<FlowDefinition>,
    @InjectRepository(FlowInstance) private readonly instRepo: Repository<FlowInstance>,
    @InjectRepository(FlowTask) private readonly taskRepo: Repository<FlowTask>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly providerFactory: LlmProviderFactory,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async getDefinition(id: string): Promise<FlowDef | null> {
    const def = await this.defRepo.findOne({ where: { id } });
    if (!def) return null;
    return {
      id: def.id,
      name: def.name,
      version: def.version,
      nodes: JSON.parse(def.nodesJson) as FlowNode[],
      security: { audit: def.audit, confirmationRequired: def.confirmationRequired },
    };
  }

  /** 注册/更新流程定义（含校验）。 */
  async upsertDefinition(def: FlowDef): Promise<FlowDef> {
    await this.defRepo.save(
      this.defRepo.create({
        id: def.id,
        name: def.name,
        version: def.version,
        nodesJson: JSON.stringify(def.nodes),
        audit: def.security?.audit ?? true,
        confirmationRequired: def.security?.confirmationRequired ?? false,
      }),
    );
    return def;
  }

  /** 发起流程：建实例 + 分发起始节点。 */
  async start(
    definitionId: string,
    data: Record<string, unknown>,
    initiatorId: number,
  ): Promise<FlowInstance> {
    const def = await this.getDefinition(definitionId);
    if (!def) throw new NotFoundException('流程定义不存在');
    if (def.nodes.length === 0) throw new BadRequestException('流程定义无节点');

    const inst = await this.instRepo.save(
      this.instRepo.create({
        definitionId,
        state: 'running',
        currentNodeId: def.nodes[0].id,
        dataJson: JSON.stringify(data),
        initiatorId,
      }),
    );
    await this.auditService.log({
      userId: String(initiatorId),
      action: 'flow_node',
      detail: `flow:${definitionId} start`,
    });
    await this.executeNode(inst, def.nodes[0], data);
    return inst;
  }

  /** 节点分发：condition/ai_task 同步推进；human_task 建任务挂起。 */
  private async executeNode(
    inst: FlowInstance,
    node: FlowNode,
    data: Record<string, unknown>,
  ): Promise<void> {
    inst.currentNodeId = node.id;
    inst.dataJson = JSON.stringify(data);
    await this.instRepo.save(inst);

    await this.auditService.log({
      userId: String(inst.initiatorId),
      action: 'flow_node',
      detail: `flow:${inst.definitionId} node:${node.id} (${node.type})`,
    });

    if (node.type === 'condition') {
      const goThen = evalCondition(node, data);
      const next = goThen ? node.then : node.else;
      await this.advance(inst, next, data);
    } else if (node.type === 'ai_task') {
      const provider = this.configService.get<string>('AI_PROVIDER', 'deepseek');
      const out = await runAiTask(this.providerFactory, node, data, provider);
      await this.advance(inst, node.next, out);
    } else {
      // human_task：建待办 + 通知，实例保持 running 挂起
      await runHumanTask(this.taskRepo, this.usersRepo, this.notificationsService, inst, node);
    }
  }

  /** 推进到下一节点；next 为空 → completed。 */
  private async advance(
    inst: FlowInstance,
    nextId: string | undefined,
    data: Record<string, unknown>,
  ): Promise<void> {
    inst.dataJson = JSON.stringify(data);
    if (!nextId) {
      inst.state = 'completed';
      inst.currentNodeId = undefined;
      await this.instRepo.save(inst);
      await this.auditService.log({
        userId: String(inst.initiatorId),
        action: 'flow_node',
        detail: `flow:${inst.definitionId} completed`,
      });
      return;
    }
    const def = await this.getDefinition(inst.definitionId);
    const nextNode = def?.nodes.find((n) => n.id === nextId);
    if (!nextNode) {
      inst.state = 'failed';
      await this.instRepo.save(inst);
      return;
    }
    await this.executeNode(inst, nextNode, data);
  }

  /** 审批：approve 推进 next（或完成）；reject → failed。 */
  async resolveTask(
    taskId: number,
    decision: 'approve' | 'reject',
    userId: number,
    note?: string,
  ): Promise<FlowInstance> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('审批任务不存在');
    if (task.assigneeId !== userId) throw new ForbiddenException('无权审批该任务');
    if (task.status !== 'pending') throw new BadRequestException('任务已处理');

    const inst = await this.instRepo.findOne({ where: { id: task.instanceId } });
    if (!inst) throw new NotFoundException('流程实例不存在');

    // FLOW-4：节点声明 roles 时，审批人须属于该角色（CASL 思路的节点级权限）
    const def = await this.getDefinition(inst.definitionId);
    const roleNode = def?.nodes.find((n) => n.id === task.nodeId);
    if (roleNode?.roles && roleNode.roles.length > 0) {
      const approver = await this.usersRepo.findOne({ where: { id: userId } });
      if (!approver || !roleNode.roles.includes(approver.role)) {
        throw new ForbiddenException('审批人角色不符');
      }
    }

    task.status = decision === 'approve' ? 'approved' : 'rejected';
    task.decisionNote = note;
    await this.taskRepo.save(task);

    await this.auditService.log({
      userId: String(userId),
      action: 'flow_node',
      detail: `flow:${inst.definitionId} task:${task.id} ${decision}`,
      isError: decision === 'reject',
    });

    if (decision === 'reject') {
      inst.state = 'failed';
      await this.instRepo.save(inst);
      return inst;
    }

    const node = roleNode as HumanTaskNode | undefined;
    const data = JSON.parse(inst.dataJson || '{}') as Record<string, unknown>;
    await this.advance(inst, node?.next, data);
    return inst;
  }

  /** 我的待办（pending 审批任务，附带节点名/流程名供 UI 展示）。 */
  async getTasksForUser(userId: number): Promise<Array<FlowTask & { title?: string; flowName?: string }>> {
    const tasks = await this.taskRepo.find({
      where: { assigneeId: userId, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
    if (tasks.length === 0) return [];
    const instances = await this.instRepo.find({
      where: { id: In(tasks.map((t) => t.instanceId)) },
    });
    const defCache = new Map<string, FlowDef>();
    for (const inst of instances) {
      if (!defCache.has(inst.definitionId)) {
        const def = await this.getDefinition(inst.definitionId);
        if (def) defCache.set(inst.definitionId, def);
      }
    }
    return tasks.map((t) => {
      const inst = instances.find((i) => i.id === t.instanceId);
      const def = inst ? defCache.get(inst.definitionId) : undefined;
      const node = def?.nodes.find((n) => n.id === t.nodeId);
      return { ...t, title: node?.name, flowName: def?.name };
    });
  }

  /** 实例详情（本人或 admin）。 */
  async getInstance(id: number, userId: number, ability: AppAbility): Promise<FlowInstance> {
    const inst = await this.instRepo.findOne({ where: { id } });
    if (!inst) throw new NotFoundException('流程实例不存在');
    if (inst.initiatorId !== userId && ability.cannot('manage', 'all')) {
      throw new ForbiddenException('无权查看该流程实例');
    }
    return inst;
  }

  /** 回滚（v1 仅状态标记，衔接 HS-3 副作用撤销思路）。 */
  async rollback(id: number): Promise<FlowInstance> {
    const inst = await this.instRepo.findOne({ where: { id } });
    if (!inst) throw new NotFoundException('流程实例不存在');
    inst.state = 'rolled_back';
    await this.instRepo.save(inst);
    return inst;
  }
}
