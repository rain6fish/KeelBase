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
  let milestones: any;
  let tasks: any;
  let risks: any;

  const project = (id: number, userId = 1) => ({ id, name: `项目${id}`, status: 'active', userId }) as PmProject;

  beforeEach(() => {
    projects = makeRepo([project(1), project(2, 2)]);
    milestones = makeRepo([]);
    tasks = makeRepo([]);
    risks = makeRepo([]);
    service = new PmService(projects as any, makeRepo([]) as any, milestones as any, tasks as any, risks as any);
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
});
