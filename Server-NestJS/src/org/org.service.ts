// SPDX-License-Identifier: Apache-2.0

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import * as crypto from 'crypto';
import { Organization } from './organization.entity';
import { Department } from './department.entity';
import { OrgMember } from './org-member.entity';
import { OrgInvite } from './org-invite.entity';
import { OrgMemberRole } from './org-member-role.enum';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { SubmitRequestDto } from './dto/submit-request.dto';
import { User } from '../common/entities/user.entity';
import { maskEmail } from '../common/utils/mask';
import { NotificationsService } from '../notifications/notifications.service';
import { FlowRuntimeService } from '../flows/flow-runtime.service';
import { FlowInstance } from '../flows/entities/flow-instance.entity';
import { FlowTask } from '../flows/entities/flow-task.entity';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MemberView {
  id: number;
  orgId: number;
  userId: number;
  deptId: number | null;
  deptName: string | null;
  role: OrgMemberRole;
  username: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  email: string | null;
}

@Injectable()
export class OrgService {
  constructor(
    @InjectRepository(Organization) private orgsRepo: Repository<Organization>,
    @InjectRepository(Department) private deptsRepo: Repository<Department>,
    @InjectRepository(OrgMember) private membersRepo: Repository<OrgMember>,
    @InjectRepository(OrgInvite) private invitesRepo: Repository<OrgInvite>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(FlowInstance) private flowInstRepo: Repository<FlowInstance>,
    @InjectRepository(FlowTask) private flowTaskRepo: Repository<FlowTask>,
    private notificationsService: NotificationsService,
    private flowRuntime: FlowRuntimeService,
  ) {}

  // ── 组织 ──

  async createOrganization(dto: CreateOrganizationDto, adminId: number): Promise<Organization> {
    const existing = await this.orgsRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException('组织名已存在');
    const saved = await this.orgsRepo.save(
      this.orgsRepo.create({ name: dto.name, description: dto.description }),
    );
    await this.membersRepo.save(
      this.membersRepo.create({ orgId: saved.id, userId: adminId, role: OrgMemberRole.OWNER }),
    );
    return saved;
  }

  async findAllOrganizations(
    page = 1,
    limit = 20,
    keyword?: string,
  ): Promise<PaginatedResult<Organization & { memberCount: number; deptCount: number }>> {
    const where: Record<string, unknown> = keyword ? { name: Like(`%${keyword}%`) } : {};
    const [orgs, total] = await this.orgsRepo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    const ids = orgs.map((o) => o.id);
    const [memberCounts, deptCounts] = await Promise.all([
      this._countGrouped(ids, 'orgId', this.membersRepo),
      this._countGrouped(ids, 'orgId', this.deptsRepo),
    ]);
    const items = orgs.map((o) => ({
      ...o,
      memberCount: memberCounts.get(o.id) ?? 0,
      deptCount: deptCounts.get(o.id) ?? 0,
    }));
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOrganization(id: number): Promise<Organization> {
    return this._ensureOrg(id);
  }

  async updateOrganization(id: number, dto: UpdateOrganizationDto): Promise<Organization> {
    const org = await this._ensureOrg(id);
    Object.assign(org, dto);
    return this.orgsRepo.save(org);
  }

  async removeOrganization(id: number): Promise<void> {
    const org = await this._ensureOrg(id);
    const memberCount = await this.membersRepo.count({ where: { orgId: org.id } });
    if (memberCount > 0) throw new BadRequestException('组织仍有成员，无法删除');
    await this.orgsRepo.softDelete(org.id);
  }

  // ── 部门 ──

  async createDepartment(orgId: number, dto: CreateDepartmentDto): Promise<Department> {
    await this._ensureOrg(orgId);
    if (dto.parentId != null) await this._ensureDeptInOrg(dto.parentId, orgId);
    await this._assertUniqueDeptName(orgId, dto.name);
    return this.deptsRepo.save(
      this.deptsRepo.create({
        orgId,
        name: dto.name,
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder ?? 0,
      }),
    );
  }

  async listDepartments(orgId: number): Promise<Department[]> {
    await this._ensureOrg(orgId);
    return this.deptsRepo.find({ where: { orgId }, order: { sortOrder: 'ASC', id: 'ASC' } });
  }

  async updateDepartment(id: number, dto: UpdateDepartmentDto): Promise<Department> {
    const dept = await this.deptsRepo.findOne({ where: { id } });
    if (!dept) throw new NotFoundException('部门不存在');
    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        dept.parentId = null;
      } else {
        await this._ensureDeptInOrg(dto.parentId, dept.orgId);
        await this._assertNoCycle(dept.id, dto.parentId, dept.orgId);
        dept.parentId = dto.parentId;
      }
    }
    if (dto.name !== undefined) {
      const dup = await this.deptsRepo.findOne({
        where: { orgId: dept.orgId, name: dto.name },
      });
      if (dup && dup.id !== dept.id) throw new ConflictException('同组织已存在同名部门');
      dept.name = dto.name;
    }
    if (dto.sortOrder !== undefined) dept.sortOrder = dto.sortOrder;
    return this.deptsRepo.save(dept);
  }

  async removeDepartment(id: number): Promise<void> {
    const dept = await this.deptsRepo.findOne({ where: { id } });
    if (!dept) throw new NotFoundException('部门不存在');
    // 子部门挂到被删部门的父级
    await this.deptsRepo.update({ parentId: dept.id }, { parentId: dept.parentId ?? null });
    // 成员脱离该部门
    await this.membersRepo.update({ deptId: dept.id }, { deptId: null });
    await this.deptsRepo.softDelete(dept.id);
  }

  // ── 成员 ──

  async listMembers(
    orgId: number,
    page = 1,
    limit = 20,
    keyword?: string,
    deptId?: number,
  ): Promise<PaginatedResult<MemberView>> {
    await this._ensureOrg(orgId);
    const qb = this.membersRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.user', 'user')
      .leftJoinAndSelect('m.dept', 'dept')
      .where('m.orgId = :orgId', { orgId });
    if (deptId) qb.andWhere('m.deptId = :deptId', { deptId });
    if (keyword) {
      qb.andWhere('(user.username LIKE :k OR user.nickname LIKE :k)', { k: `%${keyword}%` });
    }
    const total = await qb.getCount();
    const items = await qb
      .orderBy('m.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    const mapped = items.map((m) => this._toMemberView(m));
    return { items: mapped, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async addMember(orgId: number, dto: AddMemberDto): Promise<OrgMember> {
    const org = await this._ensureOrg(orgId);
    const user = await this.usersRepo.findOne({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('用户不存在');
    const dup = await this.membersRepo.findOne({ where: { orgId, userId: dto.userId } });
    if (dup) throw new ConflictException('该用户已在组织中');
    if (dto.deptId != null) await this._ensureDeptInOrg(dto.deptId, orgId);
    const saved = await this.membersRepo.save(
      this.membersRepo.create({
        orgId,
        userId: dto.userId,
        deptId: dto.deptId ?? null,
        role: dto.role ?? OrgMemberRole.MEMBER,
      }),
    );
    await this.notificationsService
      .create({
        userId: dto.userId,
        title: '加入组织',
        body: `您已被加入组织「${org.name}」`,
        type: 'org_member',
      })
      .catch(() => {});
    return saved;
  }

  async updateMember(id: number, dto: UpdateMemberDto): Promise<OrgMember> {
    const member = await this.membersRepo.findOne({ where: { id } });
    if (!member) throw new NotFoundException('成员不存在');
    if (dto.role !== undefined) {
      if (member.role === OrgMemberRole.OWNER && dto.role !== OrgMemberRole.OWNER) {
        await this._assertNotLastOwner(member.orgId, member.id);
      }
      member.role = dto.role;
    }
    if (dto.deptId !== undefined) {
      if (dto.deptId === null) {
        member.deptId = null;
      } else {
        await this._ensureDeptInOrg(dto.deptId, member.orgId);
        member.deptId = dto.deptId;
      }
    }
    return this.membersRepo.save(member);
  }

  async removeMember(id: number): Promise<void> {
    const member = await this.membersRepo.findOne({ where: { id } });
    if (!member) throw new NotFoundException('成员不存在');
    if (member.role === OrgMemberRole.OWNER) {
      await this._assertNotLastOwner(member.orgId, member.id);
    }
    await this.membersRepo.delete(member.id);
  }

  // ── 邀请（ORG-6） ──

  async createInvite(orgId: number, dto: CreateInviteDto, adminId: number): Promise<OrgInvite> {
    await this._ensureOrg(orgId);
    if (dto.deptId != null) await this._ensureDeptInOrg(dto.deptId, orgId);
    return this.invitesRepo.save(
      this.invitesRepo.create({
        code: this._generateInviteCode(),
        orgId,
        inviterId: adminId,
        role: dto.role ?? OrgMemberRole.MEMBER,
        deptId: dto.deptId ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      }),
    );
  }

  async listInvites(orgId: number): Promise<OrgInvite[]> {
    await this._ensureOrg(orgId);
    return this.invitesRepo.find({ where: { orgId }, order: { createdAt: 'DESC' } });
  }

  async removeInvite(id: number): Promise<void> {
    const invite = await this.invitesRepo.findOne({ where: { id } });
    if (!invite) throw new NotFoundException('邀请不存在');
    await this.invitesRepo.delete(id);
  }

  /** 注册后兑换组织邀请码（ORG-6）：命中则自动入组织 + 通知邀请者；无效/过期/已用静默返回 false。 */
  async redeemOrgInvite(code: string, userId: number): Promise<boolean> {
    const invite = await this.invitesRepo.findOne({ where: { code } });
    if (!invite || invite.usedBy != null) return false;
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return false;
    const existing = await this.membersRepo.findOne({ where: { orgId: invite.orgId, userId } });
    if (existing) return false; // 已是组织成员：不消耗邀请码、不发「新成员加入」通知
    await this.membersRepo.save(
      this.membersRepo.create({
        orgId: invite.orgId,
        userId,
        deptId: invite.deptId ?? null,
        role: invite.role,
      }),
    );
    invite.usedBy = userId;
    invite.usedAt = new Date();
    await this.invitesRepo.save(invite);
    await this.notificationsService
      .create({
        userId: invite.inviterId,
        title: '组织新成员',
        body: '有用户通过您的邀请码加入了组织',
        type: 'org_invite_joined',
      })
      .catch(() => {});
    return true;
  }

  // ── 申请（ORG-4，构建于 FLOW 引擎） ──

  async submitRequest(userId: number, dto: SubmitRequestDto): Promise<FlowInstance> {
    const member = await this.membersRepo.findOne({ where: { userId } });
    if (!member) throw new ForbiddenException('您不是任何组织的成员');
    const inst = await this.flowRuntime.start(
      'org_request_approval',
      { hasDepartment: member.deptId != null, title: dto.title, content: dto.content ?? '' },
      userId,
    );
    await this.notificationsService
      .create({
        userId,
        title: '申请已提交',
        body: `您的申请「${dto.title}」已提交审批`,
        type: 'flow_submitted',
        targetType: 'flow',
        targetId: String(inst.id),
      })
      .catch(() => {});
    return inst;
  }

  async listMyRequests(userId: number): Promise<FlowInstance[]> {
    return this.flowInstRepo.find({
      where: { definitionId: 'org_request_approval', initiatorId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── 我的组织 / 通讯录（ORG-7，只读脱敏） ──

  async getMyOrg(userId: number): Promise<{
    org: { id: number; name: string; description?: string };
    role: OrgMemberRole;
    deptId: number | null;
    deptPath: string[];
  }> {
    const member = await this._myMember(userId);
    const org = await this._ensureOrg(member.orgId);
    const deptPath = await this._deptPath(member.orgId, member.deptId);
    return {
      org: { id: org.id, name: org.name, description: org.description },
      role: member.role,
      deptId: member.deptId ?? null,
      deptPath,
    };
  }

  async getMyTree(userId: number): Promise<Array<Record<string, unknown>>> {
    const member = await this._myMember(userId);
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
    const member = await this._myMember(userId);
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
    const member = await this._myMember(userId);
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

  // ── 内部工具 ──

  private async _myMember(userId: number): Promise<OrgMember> {
    const member = await this.membersRepo.findOne({ where: { userId } });
    if (!member) throw new NotFoundException('您不是任何组织的成员');
    return member;
  }

  /** ORG-3 数据隔离：返回用户所属组织 id（非成员返回 null，不抛错） */
  async getUserOrgId(userId: number): Promise<number | null> {
    // A10：多组织用户取最早加入的组织，保证确定性（不依赖 DB 返回顺序）
    const member = await this.membersRepo.findOne({
      where: { userId },
      order: { id: 'ASC' },
    });
    return member?.orgId ?? null;
  }

  private async _deptPath(orgId: number, deptId: number | null | undefined): Promise<string[]> {
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

  private _generateInviteCode(): string {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += charset[crypto.randomInt(charset.length)];
    return code;
  }

  private _toMemberView(m: OrgMember): MemberView {
    return {
      id: m.id,
      orgId: m.orgId,
      userId: m.userId,
      deptId: m.deptId ?? null,
      deptName: m.dept?.name ?? null,
      role: m.role,
      username: m.user?.username ?? null,
      nickname: m.user?.nickname ?? null,
      avatarUrl: m.user?.avatarUrl ?? null,
      email: m.user ? maskEmail(m.user.email) : null,
    };
  }

  private async _ensureOrg(id: number): Promise<Organization> {
    const org = await this.orgsRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('组织不存在');
    return org;
  }

  private async _ensureDeptInOrg(deptId: number, orgId: number): Promise<Department> {
    const dept = await this.deptsRepo.findOne({ where: { id: deptId, orgId } });
    if (!dept) throw new BadRequestException('部门不属于该组织');
    return dept;
  }

  private async _assertUniqueDeptName(orgId: number, name: string): Promise<void> {
    const dup = await this.deptsRepo.findOne({ where: { orgId, name } });
    if (dup) throw new ConflictException('同组织已存在同名部门');
  }

  private async _assertNoCycle(deptId: number, newParentId: number, orgId: number): Promise<void> {
    if (newParentId === deptId) throw new BadRequestException('部门不能挂到自己下面');
    const all = await this.deptsRepo.find({ where: { orgId } });
    const children = new Map<number, number[]>();
    for (const d of all) {
      if (d.parentId != null) {
        const list = children.get(d.parentId) ?? [];
        list.push(d.id);
        children.set(d.parentId, list);
      }
    }
    const queue = [deptId];
    const seen = new Set<number>();
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (cur === newParentId) throw new BadRequestException('不能把部门挂到自己的子孙下面');
      for (const childId of children.get(cur) ?? []) queue.push(childId);
    }
  }

  private async _assertNotLastOwner(orgId: number, excludeMemberId?: number): Promise<void> {
    const qb = this.membersRepo
      .createQueryBuilder('m')
      .where('m.orgId = :orgId', { orgId })
      .andWhere('m.role = :role', { role: OrgMemberRole.OWNER });
    if (excludeMemberId != null) qb.andWhere('m.id != :excludeId', { excludeId: excludeMemberId });
    const owners = await qb.getCount();
    if (owners === 0) throw new BadRequestException('组织至少需要保留一名 owner');
  }

  private async _countGrouped(ids: number[], column: string, repo: Repository<any>): Promise<Map<number, number>> {
    if (ids.length === 0) return new Map();
    const rows = await (repo as Repository<any>)
      .createQueryBuilder('r')
      .select(`r.${column}`, 'groupKey')
      .addSelect('COUNT(*)', 'cnt')
      .where(`r.${column} IN (:...ids)`, { ids })
      .groupBy(`r.${column}`)
      .getRawMany();
    const map = new Map<number, number>();
    for (const row of rows) map.set(Number(row.groupKey), Number(row.cnt));
    return map;
  }
}
