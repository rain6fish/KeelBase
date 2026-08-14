import { Repository } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';
import { FlowInstance } from '../entities/flow-instance.entity';
import { FlowTask } from '../entities/flow-task.entity';
import { HumanTaskNode } from '../flow-definition.types';

/**
 * HumanTask 节点（FLOW-2）：建待办 + 通知审批人，实例挂起等 resolveTask 推进。
 * 审批人 v1 按 assigneeUserId 指派（缺省 = 发起人），角色解析 v1.1。
 */
export async function runHumanTask(
  taskRepo: Repository<FlowTask>,
  notificationsService: NotificationsService | null,
  instance: FlowInstance,
  node: HumanTaskNode,
): Promise<void> {
  const data = JSON.parse(instance.dataJson || '{}') as Record<string, unknown>;
  const assigneeId = node.assigneeUserId ?? ((data.approverId as number) ?? instance.initiatorId);
  await taskRepo.save(
    taskRepo.create({
      instanceId: instance.id,
      nodeId: node.id,
      assigneeId,
      status: 'pending',
    }),
  );
  if (notificationsService) {
    await notificationsService
      .create({
        userId: assigneeId,
        title: '待审批',
        body: `您有一项待审批任务：${node.name}`,
        type: 'flow_task',
        targetType: 'flow',
        targetId: String(instance.id),
      })
      .catch(() => {});
  }
}
