import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import { PmService } from './pm.service';
import { PmProject } from './pm-project.entity';

type AppAbility = MongoAbility<['manage' | 'read' | 'update' | 'delete', string | Record<string, any>]>;

function ownerAbility(userId: number): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  can('manage', 'PmProject', { userId });
  can('manage', 'PmMember', { userId });
  can('manage', 'PmMilestone', { userId });
  can('manage', 'PmTask', { userId });
  can('manage', 'PmRisk', { userId });
  return build();
}

function makeRepo<T>(rows: T[] = []) {
  return {
    create: jest.fn((d: Partial<T>) => d as T),
    save: jest.fn(async (e: any) => e),
    findOne: jest.fn(async ({ where }: any = {}) =>
      rows.find((r: any) => Object.entries(where ?? {}).every(([k, v]) => (r as any)[k] === v)) ?? null,
    ),
    find: jest.fn(async () => rows),
    findAndCount: jest.fn(async () => [rows, rows.length]),
    count: jest.fn(async () => rows.length),
    softDelete: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {};
      qb.where = () => qb;
      qb.andWhere = () => qb;
      qb.orderBy = () => qb;
      qb.skip = () => qb;
      qb.take = () => qb;
      qb.getManyAndCount = async () => [rows, rows.length];
      return qb;
    }),
  } as unknown as jest.Mocked<Repository<any>>;
}

describe('PmService', () => {
  let service: PmService;
  let projects: any;
  let members: any;
  let milestones: any;
  let tasks: any;
  let risks: any;

  const project = (id: number, userId = 1) => ({ id, name: `项目${id}`, status: 'active', userId }) as PmProject;

  beforeEach(() => {
    projects = makeRepo([project(1), project(2, 2)]);
    members = makeRepo([]);
    milestones = makeRepo([]);
    tasks = makeRepo([]);
    risks = makeRepo([]);
    service = new PmService(projects as any, members as any, milestones as any, tasks as any, risks as any);
  });

  it('createProject 归属 userId', async () => {
    await service.createProject({ name: '新项目' } as any, 7);
    expect(projects.create).toHaveBeenCalledWith({ name: '新项目', userId: 7 });
  });

  it('getProject 本人可读、非本人 Forbidden、不存在 NotFound', async () => {
    await expect(service.getProject(1, ownerAbility(1))).resolves.toMatchObject({ id: 1 });
    await expect(service.getProject(1, ownerAbility(9))).rejects.toThrow(ForbiddenException);
    await expect(service.getProject(999, ownerAbility(1))).rejects.toThrow(NotFoundException);
  });

  it('removeProject 软删本人项目', async () => {
    await service.removeProject(1, ownerAbility(1));
    expect(projects.softDelete).toHaveBeenCalledWith(1);
  });

  it('createTask 关联非本人项目 → NotFound（防越权）', async () => {
    await expect(service.createTask({ projectId: 2, title: 'x' } as any, 1)).rejects.toThrow(NotFoundException);
  });

  it('completeTask 非本人 → NotFound', async () => {
    tasks.findOne.mockImplementation(async () => null);
    await expect(service.completeTask(1, 1)).rejects.toThrow(NotFoundException);
  });

  describe('analyzeProjectRisk', () => {
    it('逾期任务 + 延期里程碑 + 未解决风险 → high', async () => {
      projects.findOne.mockResolvedValue({ ...project(1), endDate: new Date('2026-12-31') });
      tasks.find.mockResolvedValue([{ id: 1, title: 't', status: 'pending', dueDate: new Date('2020-01-01') }]);
      milestones.find.mockResolvedValue([{ id: 1, title: 'm', status: 'pending', dueDate: new Date('2020-01-01') }]);
      risks.find.mockResolvedValue([{ level: 'high', reason: 'r', resolvedAt: null }]);
      const result = await service.analyzeProjectRisk(1, 1);
      expect(result.level).toBe('high');
      expect(result.reasons.some((r) => r.includes('任务逾期'))).toBe(true);
      expect(result.reasons.some((r) => r.includes('里程碑已延期'))).toBe(true);
    });

    it('已完成项目 → low（风险清零）', async () => {
      projects.findOne.mockResolvedValue({ ...project(1), status: 'completed' });
      tasks.find.mockResolvedValue([]);
      milestones.find.mockResolvedValue([]);
      risks.find.mockResolvedValue([]);
      const result = await service.analyzeProjectRisk(1, 1);
      expect(result.level).toBe('low');
      expect(result.reasons.length).toBe(0);
    });
  });

  it('listProjects 分页钳制 + 状态/关键词过滤', async () => {
    const qb: any = {
      andWhere: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getManyAndCount: jest.fn().mockResolvedValue([[project(1)], 1]),
    };
    const whereSpy = jest.fn(() => qb);
    projects.createQueryBuilder.mockReturnValue({ ...qb, where: whereSpy });

    const result = await service.listProjects(1, { status: 'active', keyword: '项目', page: 2, limit: 500 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    // limit 被钳到 100，page 保持 2 → skip 100
    expect(qb.skip).toHaveBeenCalledWith(100);
    expect(qb.take).toHaveBeenCalledWith(100);
    expect(whereSpy).toHaveBeenCalledWith('p.userId = :userId', { userId: 1 });
    expect(qb.andWhere).toHaveBeenCalledWith('p.status = :status', { status: 'active' });
    expect(qb.andWhere).toHaveBeenCalledWith('(p.name LIKE :kw OR p.description LIKE :kw)', { kw: '%项目%' });
  });

  it('listProjects 无过滤时不追加 andWhere', async () => {
    const qb: any = {
      andWhere: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    projects.createQueryBuilder.mockReturnValue({ ...qb, where: jest.fn(() => qb) });
    await service.listProjects(1);
    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('updateProject 合并字段并保存', async () => {
    const entity = { ...project(1), name: '旧' };
    projects.findOne.mockResolvedValue(entity);
    projects.save.mockImplementation(async (e: any) => e);
    const result = await service.updateProject(1, { name: '新' } as any, ownerAbility(1));
    expect(result.name).toBe('新');
    expect(projects.save).toHaveBeenCalled();
  });

  it('getProjectDetail 聚合子资源', async () => {
    projects.findOne.mockResolvedValue(project(1));
    milestones.find.mockResolvedValue([{ id: 1, title: 'M1' }]);
    tasks.find.mockResolvedValue([{ id: 1, title: 'T1' }]);
    risks.find.mockResolvedValue([{ id: 1, level: 'high' }]);
    members.count.mockResolvedValue(2);
    const detail = await service.getProjectDetail(1, ownerAbility(1));
    expect(detail.project.id).toBe(1);
    expect(detail.milestones).toHaveLength(1);
    expect(detail.tasks).toHaveLength(1);
    expect(detail.risks).toHaveLength(1);
    expect(detail.memberCount).toBe(2);
  });

  it('成员子资源：list/add（重复返回已有）/remove', async () => {
    members.find.mockResolvedValue([{ id: 1, userId: 5 }]);
    const list = await service.listMembers(1, 1);
    expect(list).toHaveLength(1);

    members.findOne.mockResolvedValue({ id: 1, projectId: 1, userId: 5 });
    const dup = await service.addMember(1, 5, 'member', 1);
    expect(dup.id).toBe(1); // 重复返回已有，不新建
    expect(members.save).not.toHaveBeenCalled();

    members.findOne.mockResolvedValue(null);
    members.create.mockImplementation((d: any) => d);
    await service.addMember(1, 6, 'member', 1);
    expect(members.save).toHaveBeenCalledWith({ projectId: 1, userId: 6, role: 'member' });

    members.delete.mockResolvedValue({ affected: 1 });
    await service.removeMember(1, 9, 1);
    expect(members.delete).toHaveBeenCalledWith({ id: 9, projectId: 1 });
  });

  it('里程碑子资源：list/create', async () => {
    milestones.find.mockResolvedValue([{ id: 1 }]);
    await expect(service.listMilestones(1, 1)).resolves.toHaveLength(1);
    milestones.create.mockImplementation((d: any) => d);
    await service.createMilestone(1, { title: 'M1', dueDate: '2026-12-01' } as any, 1);
    expect(milestones.save).toHaveBeenCalledWith(expect.objectContaining({ projectId: 1, title: 'M1', dueDate: expect.any(Date) }));
  });

  it('任务子资源：list 带/不带项目、createTask 成功、completeTask 成功', async () => {
    tasks.findAndCount.mockResolvedValue([[{ id: 1, userId: 1 }], 1]);
    const withProject = await service.listTasks(1, 1);
    expect(withProject.items).toHaveLength(1);
    expect(tasks.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 1, projectId: 1 } }));
    await service.listTasks(1);
    expect(tasks.findAndCount).toHaveBeenLastCalledWith(expect.objectContaining({ where: { userId: 1 } }));

    tasks.create.mockImplementation((d: any) => d);
    await service.createTask({ projectId: 1, title: 'T' } as any, 1);
    expect(tasks.save).toHaveBeenCalledWith(expect.objectContaining({ projectId: 1, title: 'T', userId: 1 }));

    tasks.findOne.mockResolvedValue({ id: 1, userId: 1, status: 'pending' });
    tasks.save.mockImplementation(async (e: any) => e);
    const done = await service.completeTask(1, 1);
    expect(done.status).toBe('completed');
  });

  it('风险子资源：list/create（默认 detectedAt）', async () => {
    risks.find.mockResolvedValue([{ id: 1 }]);
    await expect(service.listRisks(1, 1)).resolves.toHaveLength(1);
    risks.create.mockImplementation((d: any) => d);
    await service.createRisk(1, { level: 'high', description: 'x' } as any, 1);
    expect(risks.save).toHaveBeenCalledWith(expect.objectContaining({ projectId: 1, level: 'high', detectedAt: expect.any(Date) }));
  });

  it('子资源非本人项目 → NotFound（_assertProjectOwner）', async () => {
    await expect(service.listMembers(2, 1)).rejects.toThrow(NotFoundException); // project(2) 属于 userId 2
  });
});
