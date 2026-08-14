import { Repository } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';
import { User } from '../../common/entities/user.entity';
import { FlowInstance } from '../entities/flow-instance.entity';
import { FlowTask } from '../entities/flow-task.entity';
import { HumanTaskNode } from '../flow-definition.types';

/**
 * HumanTask 节点（FLOW-2/FLOW-4）：建待办 + 通知审批人，实例挂起等 resolveTask 推进。
 * 审批人解析优先级（FLOW-4 角色）：
 *   assigneeUserId > data.approverId > node.roles（取该角色第一个用户）> 发起人
 */
export async function runHumanTask(
  taskRepo: Repository<FlowTask>,
  usersRepo: Repository<User>,
  notificationsService: NotificationsService | null,
  instance: FlowInstance,
  node: HumanTaskNode,
): Promise<void> {
  const data = JSON.parse(instance.dataJson || '{}') as Record<string, unknown>;
  let assigneeId: number =
    node.assigneeUserId ?? ((data.approverId as number) ?? instance.initiatorId);

  if (!node.assigneeUserId && !data.approverId && node.roles && node.roles.length > 0) {
    for (const role of node.roles) {
      const candidates = await usersRepo.find({ where: { role: role as never }, take: 1 });
      if (candidates.length > 0) {
        assigneeId = candidates[0].id;
        break;
      }
    }
  }

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
