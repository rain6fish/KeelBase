import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
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
import { User } from '../common/entities/user.entity';
import { maskEmail } from '../common/utils/mask';
import { NotificationsService } from '../notifications/notifications.service';

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
    private notificationsService: NotificationsService,
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

  // ── 内部工具 ──

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
