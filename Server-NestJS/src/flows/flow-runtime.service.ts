// SPDX-License-Identifier: Apache-2.0

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
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
import { OrgMember } from '../org/org-member.entity';
import { OrgMemberRole } from '../org/org-member-role.enum';
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
  private readonly logger = new Logger(FlowRuntimeService.name);

  constructor(
    @InjectRepository(FlowDefinition) private readonly defRepo: Repository<FlowDefinition>,
    @InjectRepository(FlowInstance) private readonly instRepo: Repository<FlowInstance>,
    @InjectRepository(FlowTask) private readonly taskRepo: Repository<FlowTask>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(OrgMember) private readonly orgMemberRepo: Repository<OrgMember>,
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
      businessEvent: 'FlowInstanceStarted',
      evidence: JSON.stringify({ definitionId, definitionName: def.name, event: 'start' }),
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
      businessEvent: 'FlowNodeReached',
      evidence: JSON.stringify({
        definitionId: inst.definitionId,
        nodeId: node.id,
        nodeName: node.name ?? null,
        nodeType: node.type,
        event: 'node',
      }),
    });

    try {
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
        await runHumanTask(
          this.taskRepo,
          this.usersRepo,
          this.orgMemberRepo,
          this.notificationsService,
          inst,
          node,
        );
      }
    } catch (err) {
      // AI/condition 节点异常（provider 未配置/超时/LLM 错）→ 实例置 failed，避免永久卡 running 无法自愈
      inst.state = 'failed';
      await this.instRepo.save(inst);
      this.logger.error(`[Flow] instance ${inst.id} failed at node ${node.id} (${node.type}): ${(err as Error).message}`);
      throw err;
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
        businessEvent: 'FlowInstanceCompleted',
        evidence: JSON.stringify({ definitionId: inst.definitionId, event: 'completed' }),
      });
      await this._notifyResult(inst, true);
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
    // ORG-4：节点声明 assigneeOrgRole 时，复查审批人当前仍持有该组织角色（防岗位变更后旧审批人越权）
    if (roleNode && roleNode.type === 'human_task' && roleNode.assigneeOrgRole) {
      await this._assertOrgRoleStillHeld(inst.initiatorId, userId, roleNode);
    }

    task.status = decision === 'approve' ? 'approved' : 'rejected';
    task.decisionNote = note;
    await this.taskRepo.save(task);

    await this.auditService.log({
      userId: String(userId),
      action: 'flow_node',
      detail: `flow:${inst.definitionId} task:${task.id} ${decision}`,
      isError: decision === 'reject',
      businessEvent: decision === 'approve' ? 'FlowTaskApproved' : 'FlowTaskRejected',
      evidence: JSON.stringify({
        definitionId: inst.definitionId,
        instanceId: inst.id,
        taskId: task.id,
        nodeId: task.nodeId,
        nodeName: roleNode?.name ?? task.nodeId,
        decision,
        note: note ?? null,
        approverId: userId,
        event: 'resolve',
      }),
    });

    if (decision === 'reject') {
      inst.state = 'failed';
      await this.instRepo.save(inst);
      await this._notifyResult(inst, false);
      return inst;
    }

    const node = roleNode as HumanTaskNode | undefined;
    const data = JSON.parse(inst.dataJson || '{}') as Record<string, unknown>;
    await this.advance(inst, node?.next, data);
    return inst;
  }

  /** A-7：本人发起的流程实例列表（含定义名 + 待审批任务数，前端「我的流程」导航入口）。 */
  async getMyInstances(
    userId: number,
  ): Promise<
    Array<{
      id: number;
      definitionId: string;
      definitionName: string | null;
      state: string;
      initiatorId: number;
      pendingTasks: number;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    const insts = await this.instRepo.find({
      where: { initiatorId: userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    if (insts.length === 0) return [];
    const defs = await this.defRepo.find({
      where: { id: In([...new Set(insts.map((i) => i.definitionId))]) },
    });
    const defMap = new Map(defs.map((d) => [d.id, d.name]));
    const pendingRows = await this.taskRepo
      .createQueryBuilder('t')
      .select('t.instanceId', 'instanceId')
      .addSelect('COUNT(*)', 'cnt')
      .where('t.status = :pending', { pending: 'pending' })
      .andWhere('t.instanceId IN (:...ids)', { ids: insts.map((i) => i.id) })
      .groupBy('t.instanceId')
      .getRawMany();
    const pendingMap = new Map(pendingRows.map((c) => [Number(c.instanceId), Number(c.cnt)]));
    return insts.map((i) => ({
      id: i.id,
      definitionId: i.definitionId,
      definitionName: defMap.get(i.definitionId) ?? null,
      state: i.state,
      initiatorId: i.initiatorId,
      pendingTasks: pendingMap.get(i.id) ?? 0,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));
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
  async getInstance(
    id: number,
    userId: number,
    ability: AppAbility,
  ): Promise<
    FlowInstance & {
      initiatorName?: string | null;
      definitionName?: string | null;
      tasks?: Array<{
        taskId: number;
        nodeId: string;
        nodeName: string;
        assigneeId: number;
        assigneeName: string | null;
        status: string;
        decisionNote: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>;
    }
  > {
    const inst = await this.instRepo.findOne({ where: { id } });
    if (!inst) throw new NotFoundException('流程实例不存在');
    if (inst.initiatorId !== userId && ability.cannot('manage', 'all')) {
      throw new ForbiddenException('无权查看该流程实例');
    }
    // A-7 审批链：实例全部 human_task 任务（发起人 → 每级审批人/结果/意见 → 终态），联用户表带用户名
    const def = await this.getDefinition(inst.definitionId);
    const tasks = await this.taskRepo.find({ where: { instanceId: id }, order: { createdAt: 'ASC' } });
    const ids = [...new Set([inst.initiatorId, ...tasks.map((t) => t.assigneeId)])];
    const users = await this.usersRepo.find({ where: { id: In(ids) } });
    const nameMap = new Map(users.map((u) => [u.id, u.username]));
    return {
      ...inst,
      initiatorName: nameMap.get(inst.initiatorId) ?? null,
      definitionName: def?.name ?? null,
      tasks: tasks.map((t) => ({
        taskId: t.id,
        nodeId: t.nodeId,
        nodeName: def?.nodes.find((n) => n.id === t.nodeId)?.name ?? t.nodeId,
        assigneeId: t.assigneeId,
        assigneeName: nameMap.get(t.assigneeId) ?? null,
        status: t.status,
        decisionNote: t.decisionNote ?? null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    };
  }

  /** 回滚（v1 仅状态标记，衔接 HS-3 副作用撤销思路）。 */
  async rollback(id: number): Promise<FlowInstance> {
    const inst = await this.instRepo.findOne({ where: { id } });
    if (!inst) throw new NotFoundException('流程实例不存在');
    inst.state = 'rolled_back';
    await this.instRepo.save(inst);
    return inst;
  }

  /** ORG-4：审批时复查审批人当前仍持有该组织角色（发起人同组织/同部门）。 */
  private async _assertOrgRoleStillHeld(
    initiatorId: number,
    approverId: number,
    node: HumanTaskNode,
  ): Promise<void> {
    const initiatorMember = await this.orgMemberRepo.findOne({ where: { userId: initiatorId } });
    if (!initiatorMember) throw new ForbiddenException('发起人已不在组织中');
    const allowedRoles: OrgMemberRole[] =
      node.assigneeOrgRole!.role === OrgMemberRole.ADMIN
        ? [OrgMemberRole.OWNER, OrgMemberRole.ADMIN]
        : [node.assigneeOrgRole!.role as OrgMemberRole];
    const where: Record<string, unknown> = {
      orgId: initiatorMember.orgId,
      userId: approverId,
      role: In(allowedRoles),
    };
    if (node.assigneeOrgRole!.scope === 'department') {
      if (initiatorMember.deptId == null) throw new ForbiddenException('发起人已无部门');
      where.deptId = initiatorMember.deptId;
    }
    const approverMember = await this.orgMemberRepo.findOne({ where });
    if (!approverMember) throw new ForbiddenException('审批人当前不再持有该组织角色');
  }

  /** 流程完成/驳回时通知发起人（MS-1 触达）。 */
  private async _notifyResult(inst: FlowInstance, approved: boolean): Promise<void> {
    const def = await this.getDefinition(inst.definitionId);
    await this.notificationsService
      .create({
        userId: inst.initiatorId,
        title: approved ? '流程已完成' : '流程被驳回',
        body: `您的流程「${def?.name ?? inst.definitionId}」${approved ? '已通过审批' : '被驳回'}`,
        type: 'flow_result',
        targetType: 'flow',
        targetId: String(inst.id),
      })
      .catch(() => {});
  }
}
