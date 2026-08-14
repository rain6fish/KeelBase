import { Repository, In, Not } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';
import { User } from '../../common/entities/user.entity';
import { OrgMember } from '../../org/org-member.entity';
import { OrgMemberRole } from '../../org/org-member-role.enum';
import { FlowInstance } from '../entities/flow-instance.entity';
import { FlowTask } from '../entities/flow-task.entity';
import { HumanTaskNode } from '../flow-definition.types';

/**
 * HumanTask 节点（FLOW-2/FLOW-4）：建待办 + 通知审批人，实例挂起等 resolveTask 推进。
 * 审批人解析优先级：
 *   assigneeUserId > data.approverId > assigneeOrgRole（ORG-4，按发起人组织/部门解析）> node.roles（全局角色）> 发起人
 */

/** 按组织角色解析审批人（ORG-4）。role=admin 时匹配 owner+admin；排除发起人本人。 */
async function resolveOrgAssignee(
  orgMemberRepo: Repository<OrgMember>,
  initiatorId: number,
  node: HumanTaskNode,
): Promise<number | undefined> {
  if (!node.assigneeOrgRole) return undefined;
  const myMember = await orgMemberRepo.findOne({ where: { userId: initiatorId } });
  if (!myMember) return undefined;
  const allowedRoles: OrgMemberRole[] =
    node.assigneeOrgRole.role === OrgMemberRole.ADMIN
      ? [OrgMemberRole.OWNER, OrgMemberRole.ADMIN]
      : [node.assigneeOrgRole.role as OrgMemberRole];
  const where: Record<string, unknown> = {
    orgId: myMember.orgId,
    role: In(allowedRoles),
    userId: Not(initiatorId),
  };
  if (node.assigneeOrgRole.scope === 'department') {
    if (myMember.deptId == null) return undefined;
    where.deptId = myMember.deptId;
  }
  const candidate = await orgMemberRepo.findOne({ where, order: { createdAt: 'ASC' } });
  return candidate?.userId;
}

export async function runHumanTask(
  taskRepo: Repository<FlowTask>,
  usersRepo: Repository<User>,
  orgMemberRepo: Repository<OrgMember>,
  notificationsService: NotificationsService | null,
  instance: FlowInstance,
  node: HumanTaskNode,
): Promise<void> {
  const data = JSON.parse(instance.dataJson || '{}') as Record<string, unknown>;
  let assigneeId: number =
    node.assigneeUserId ?? ((data.approverId as number) ?? instance.initiatorId);

  if (!node.assigneeUserId && !data.approverId) {
    // ORG-4：组织角色解析（优先于全局角色）
    const orgAssignee = await resolveOrgAssignee(orgMemberRepo, instance.initiatorId, node);
    if (orgAssignee != null) {
      assigneeId = orgAssignee;
    } else if (node.roles && node.roles.length > 0) {
      for (const role of node.roles) {
        const candidates = await usersRepo.find({ where: { role: role as never }, take: 1 });
        if (candidates.length > 0) {
          assigneeId = candidates[0].id;
          break;
        }
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
