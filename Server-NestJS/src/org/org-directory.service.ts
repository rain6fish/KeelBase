// SPDX-License-Identifier: Apache-2.0

/**
 * 组织通讯录（阶段 3 第十五刀：从 `OrgService` 拆出的成员视角只读域，ORG-5/ORG-7）。
 *
 * 回答的是「**我所在的组织长什么样**」——我的组织与部门路径、部门树、同组织成员（脱敏白名单）、
 * 组织内审批待办统计。四种都是**按调用者本人所属组织**限定范围的**只读**视图，不提供任何管理写入。
 *
 * 与 `OrgService` 的分工：那个管「组织/部门/成员/邀请的增删改查」（管理端），本域管「成员自己看得到什么」。
 * 两者共用同一条**组织存在性校验**（{@link ensureOrg}）——同一条判据只有一处实现。
 *
 * 脱敏口径：`listMyMembers` 走**白名单**（仅 id/nickname/avatarUrl/role/deptName，不含 email/phone/username），
 * 比管理端 `listMembers` 更严；两处口径不同是**有意**的（管理端要 email 掩码、成员端不给）。
 *
 * **行为与拆分前逐字一致**——搬迁不改逻辑（阶段 3 纪律：行为不变，测试作护栏）。
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './organization.entity';
import { Department } from './department.entity';
import { OrgMember } from './org-member.entity';
import { OrgMemberRole } from './org-member-role.enum';
import { FlowTask } from '../flows/entities/flow-task.entity';
import { ensureOrg } from './org-lookup';

@Injectable()
export class OrgDirectoryService {
  constructor(
    @InjectRepository(Organization) private orgsRepo: Repository<Organization>,
    @InjectRepository(Department) private deptsRepo: Repository<Department>,
    @InjectRepository(OrgMember) private membersRepo: Repository<OrgMember>,
    @InjectRepository(FlowTask) private flowTaskRepo: Repository<FlowTask>,
  ) {}

  // ── 我的组织 / 通讯录（ORG-7，只读脱敏） ──

  async getMyOrg(userId: number): Promise<{
    org: { id: number; name: string; description?: string };
    role: OrgMemberRole;
    deptId: number | null;
    deptPath: string[];
  }> {
    const member = await this.myMember(userId);
    const org = await ensureOrg(this.orgsRepo, member.orgId);
    const deptPath = await this.deptPath(member.orgId, member.deptId);
    return {
      org: { id: org.id, name: org.name, description: org.description },
      role: member.role,
      deptId: member.deptId ?? null,
      deptPath,
    };
  }

  async getMyTree(userId: number): Promise<Array<Record<string, unknown>>> {
    const member = await this.myMember(userId);
    const depts = await this.deptsRepo.find({ where: { orgId: member.orgId } });
    const members = await this.membersRepo.find({ where: { orgId: member.orgId } });
    const countByDept = new Map<number, number>();
    for (const m of members) {
      if (m.deptId == null) continue;
      countByDept.set(m.deptId, (countByDept.get(m.deptId) ?? 0) + 1);
    }
    const nodeMap = new Map<number, Record<string, unknown>>();
    for (const d of depts) {
      nodeMap.set(d.id, { id: d.id, name: d.name, parentId: d.parentId, memberCount: countByDept.get(d.id) ?? 0, children: [] as unknown[] });
    }
    const roots: Array<Record<string, unknown>> = [];
    for (const d of depts) {
      const node = nodeMap.get(d.id)!;
      if (d.parentId != null && nodeMap.has(d.parentId)) {
        (nodeMap.get(d.parentId)!.children as unknown[]).push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async listMyMembers(userId: number): Promise<Array<Record<string, unknown>>> {
    const member = await this.myMember(userId);
    const members = await this.membersRepo.find({
      where: { orgId: member.orgId },
      relations: { user: true, dept: true },
    });
    // 脱敏白名单：仅 id/nickname/avatarUrl/role/deptName，不含 email/phone/username
    return members.map((m) => ({
      id: m.userId,
      nickname: m.user?.nickname ?? null,
      avatarUrl: m.user?.avatarUrl ?? null,
      role: m.role,
      deptName: m.dept?.name ?? null,
    }));
  }

  /**
   * ORG-5：组织审批待办统计——按组织成员聚合审批任务（pending / 已处理）。
   * 数据限定在用户所属组织内（成员 + 任务均以 org 域过滤）。
   */
  async getOrgApprovalTaskStats(userId: number): Promise<{
    orgId: number;
    members: Array<{ nickname: string | null; deptName: string | null; pending: number; processed: number; total: number }>;
  }> {
    const member = await this.myMember(userId);
    const members = await this.membersRepo.find({
      where: { orgId: member.orgId },
      relations: { user: true, dept: true },
    });
    const memberIds = members.map((m) => m.userId);
    const tasks = await this.flowTaskRepo
      .createQueryBuilder('t')
      .where('t.assigneeId IN (:...ids)', { ids: memberIds })
      .getMany();
    const pending = new Map<number, number>();
    const processed = new Map<number, number>();
    for (const t of tasks) {
      if (t.status === 'pending') {
        pending.set(t.assigneeId, (pending.get(t.assigneeId) ?? 0) + 1);
      } else if (t.status === 'approved' || t.status === 'rejected') {
        processed.set(t.assigneeId, (processed.get(t.assigneeId) ?? 0) + 1);
      }
    }
    return {
      orgId: member.orgId,
      members: members.map((m) => {
        const p = pending.get(m.userId) ?? 0;
        const c = processed.get(m.userId) ?? 0;
        return {
          nickname: m.user?.nickname ?? null,
          deptName: m.dept?.name ?? null,
          pending: p,
          processed: c,
          total: p + c,
        };
      }),
    };
  }

    private async myMember(userId: number): Promise<OrgMember> {
    const member = await this.membersRepo.findOne({ where: { userId } });
    if (!member) throw new NotFoundException('您不是任何组织的成员');
    return member;
  }

    private async deptPath(orgId: number, deptId: number | null | undefined): Promise<string[]> {
    if (deptId == null) return [];
    const depts = await this.deptsRepo.find({ where: { orgId } });
    const byId = new Map<number, Department>();
    for (const d of depts) byId.set(d.id, d);
    const path: string[] = [];
    let cur = byId.get(deptId);
    while (cur) {
      path.unshift(cur.name);
      cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
    }
    return path;
  }

  /**
   * 权限-2：「本部门及以下」下钻——返回 deptId **及其全部子孙**部门 id（含自身）。
   * 走 `ancestors` 物化路径（绑定参数，不做字符串拼接），单次查询。
   */
}
