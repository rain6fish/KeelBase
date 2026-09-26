// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { User } from '../common/entities/user.entity';
import { Event } from '../events/event.entity';
import { Todo } from '../todos/todo.entity';
import { Notification } from '../notifications/notification.entity';
import { UserSession } from '../auth/user-session.entity';
import { OperationAuditLog } from '../operation-audit/operation-audit-log.entity';
import { AiAuditLog } from '../ai/audit/ai-audit-log.entity';
import { AiConversation } from '../ai/conversation/ai-conversation.entity';
import { KnowledgeArticle } from '../ai/rag/knowledge-article.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { MetricsService } from '../metrics/metrics.service';
import { EncryptionService } from '../common/utils/encryption';
import { AdminService } from './admin.service';

function mockRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    findOne: jest.fn().mockResolvedValue(null),
    restore: jest.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  };
}

/**
 * A metadata stand-in. The trash reads `name`, `target`, `deleteDateColumn` and `columns`, so
 * that is all these carry — and `target` is a plain string, which TypeORM accepts.
 *
 * 元数据替身。回收站只读 `name` / `target` / `deleteDateColumn` / `columns`，故这里也只有这些 ——
 * 而 `target` 用普通字符串，TypeORM 接受这种写法。
 */
function mdOf(
  name: string,
  opts: { softDeletable?: boolean; columns?: string[] } = {},
) {
  return {
    name,
    target: name,
    deleteDateColumn: opts.softDeletable === false ? undefined : { propertyName: 'deletedAt' },
    columns: (opts.columns ?? ['id', 'deletedAt', 'title', 'userId']).map((propertyName) => ({
      propertyName,
    })),
  };
}

describe('AdminService · 回收站（RG-3）', () => {
  let service: AdminService;
  let usersRepo: ReturnType<typeof mockRepo>;
  let repos: Map<string, ReturnType<typeof mockRepo>>;
  let metas: ReturnType<typeof mdOf>[];

  /** 每个实体一个 mock repo，按 target（字符串）查表；类型集合由用例决定。 */
  const repoFor = (target: string) => {
    if (!repos.has(target)) repos.set(target, mockRepo());
    return repos.get(target)!;
  };

  async function build() {
    repos = new Map();
    usersRepo = mockRepo();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Event), useValue: mockRepo() },
        { provide: getRepositoryToken(Todo), useValue: mockRepo() },
        { provide: getRepositoryToken(Notification), useValue: mockRepo() },
        { provide: getRepositoryToken(UserSession), useValue: mockRepo() },
        { provide: getRepositoryToken(OperationAuditLog), useValue: mockRepo() },
        { provide: getRepositoryToken(AiAuditLog), useValue: mockRepo() },
        { provide: getRepositoryToken(AiConversation), useValue: mockRepo() },
        { provide: getRepositoryToken(KnowledgeArticle), useValue: mockRepo() },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: MetricsService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: DataSource,
          useValue: {
            entityMetadatas: metas,
            getRepository: jest.fn((target: string) => repoFor(target)),
          },
        },
        { provide: EncryptionService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(AdminService);
  }

  describe('派生：类型集合来自实体元数据，不来自清单', () => {
    beforeEach(async () => {
      metas = [
        mdOf('Event'),
        mdOf('Todo'),
        mdOf('PmProject', { columns: ['id', 'deletedAt', 'name', 'userId'] }),
        mdOf('PmTask'),
        mdOf('Contract', { columns: ['id', 'deletedAt', 'name', 'userId'] }),
        mdOf('User', { softDeletable: false }), // 不带软删列 ⇒ 不应出现
      ];
      await build();
    });

    it('凡带软删列的实体都进回收站，没有软删列的实体不进', async () => {
      repoFor('Event').find.mockResolvedValue([
        { id: 1, title: '事件', userId: 1, deletedAt: new Date('2026-09-01T00:00:00Z') },
      ]);
      repoFor('Contract').find.mockResolvedValue([
        { id: 5, name: '合同', userId: 1, deletedAt: new Date('2026-09-02T00:00:00Z') },
      ]);

      const result = await service.getTrash(1, 20);

      expect(result.items.map((i) => i.type).sort()).toEqual(['contract', 'event']);
      // 没有软删列的实体一次都没被查过
      expect(repos.has('User')).toBe(false);
    });

    it('旧别名保留：PmProject → project、PmTask → task；其余用类名小写', async () => {
      const result = await service.getTrash(1, 20);

      expect(result.total).toBe(0);
      // 派生的 type 集合：别名两个 + 其余小写；Contract 就是 contract
      expect([...repos.keys()].sort()).toEqual(['Contract', 'Event', 'PmProject', 'PmTask', 'Todo']);
      expect(result.items).toEqual([]);
    });

    it('展示列与归属列按列名推导：name 当标题、requesterId 当归属、两者都无则 null', async () => {
      metas = [
        mdOf('ApprovalRequest', { columns: ['id', 'deletedAt', 'title', 'requesterId'] }),
        mdOf('FlowInstance', { columns: ['id', 'deletedAt', 'state', 'initiatorId'] }),
        mdOf('Organization', { columns: ['id', 'deletedAt', 'name'] }),
      ];
      await build();
      repoFor('ApprovalRequest').find.mockResolvedValue([
        { id: 1, title: '报销申请', requesterId: 7, deletedAt: new Date('2026-09-03T00:00:00Z') },
      ]);
      repoFor('FlowInstance').find.mockResolvedValue([
        { id: 2, state: 'running', initiatorId: 8, deletedAt: new Date('2026-09-02T00:00:00Z') },
      ]);
      repoFor('Organization').find.mockResolvedValue([
        { id: 3, name: '总部', deletedAt: new Date('2026-09-01T00:00:00Z') },
      ]);
      usersRepo.find.mockResolvedValue([{ id: 7, username: 'alice' }]);

      const { items } = await service.getTrash(1, 20);

      expect(items[0]).toMatchObject({ type: 'approvalrequest', title: '报销申请', userId: 7, username: 'alice' });
      // 无展示列 ⇒ title 为 null（如实，而不是硬塞 title）
      expect(items[1]).toMatchObject({ type: 'flowinstance', title: null, userId: 8 });
      // 无归属列 ⇒ userId 为 null
      expect(items[2]).toMatchObject({ type: 'organization', title: '总部', userId: null, username: null });
    });

    it('只读窄投影：select 里不得出现展示/归属之外的列（管理端红线）', async () => {
      metas = [mdOf('CrmCustomer', { columns: ['id', 'deletedAt', 'name', 'userId', 'email', 'phone'] })];
      await build();

      await service.getTrash(1, 20);

      const arg = repoFor('CrmCustomer').find.mock.calls[0][0];
      // 对象形态（TypeORM 1.x 只认这一种）
      expect(arg.select).toEqual({ id: true, deletedAt: true, name: true, userId: true });
      expect(Object.keys(arg.select)).not.toContain('email');
      expect(Object.keys(arg.select)).not.toContain('phone');
    });
  });

  describe('全局分页（修掉「每类各取一页再合并」）', () => {
    beforeEach(async () => {
      metas = [mdOf('Event'), mdOf('Todo'), mdOf('PmProject', { columns: ['id', 'deletedAt', 'name', 'userId'] })];
      await build();
      // 三类各两条，删除时刻交错：全局倒序应为 e1 > t1 > p1 > e2 > t2 > p2
      repoFor('Event').find.mockResolvedValue([
        { id: 1, title: 'E1', userId: 1, deletedAt: new Date('2026-09-06T00:00:00Z') },
        { id: 2, title: 'E2', userId: 1, deletedAt: new Date('2026-09-03T00:00:00Z') },
      ]);
      repoFor('Todo').find.mockResolvedValue([
        { id: 1, title: 'T1', userId: 1, deletedAt: new Date('2026-09-05T00:00:00Z') },
        { id: 2, title: 'T2', userId: 1, deletedAt: new Date('2026-09-02T00:00:00Z') },
      ]);
      repoFor('PmProject').find.mockResolvedValue([
        { id: 1, name: 'P1', userId: 1, deletedAt: new Date('2026-09-04T00:00:00Z') },
        { id: 2, name: 'P2', userId: 1, deletedAt: new Date('2026-09-01T00:00:00Z') },
      ]);
    });

    it('一页恰好 limit 行、跨类型按删除时刻倒序，且不出现 4×limit', async () => {
      const page1 = await service.getTrash(1, 2);

      expect(page1.items).toHaveLength(2);
      expect(page1.items.map((i) => i.title)).toEqual(['E1', 'T1']);
      expect(page1.total).toBe(6);
      expect(page1.totalPages).toBe(3);
    });

    it('跨页不重不漏：三页拼起来恰好是全部六条，顺序全局一致', async () => {
      const titles: string[] = [];
      for (const p of [1, 2, 3]) {
        const { items } = await service.getTrash(p, 2);
        titles.push(...items.map((i) => i.title ?? ''));
      }

      expect(titles).toEqual(['E1', 'T1', 'P1', 'E2', 'T2', 'P2']);
      expect(new Set(titles).size).toBe(6);
    });
  });

  describe('恢复', () => {
    beforeEach(async () => {
      metas = [mdOf('Todo'), mdOf('Contract', { columns: ['id', 'deletedAt', 'name', 'userId'] })];
      await build();
    });

    it('派生的类型也能恢复（这是本次改动的要点：生成模块不再无路可回）', async () => {
      repoFor('Contract').findOne.mockResolvedValue({ id: 5, deletedAt: new Date() });

      await expect(service.restoreTrashItem('contract', 5)).resolves.toEqual({
        restored: true,
        type: 'contract',
        id: 5,
      });
      expect(repoFor('Contract').restore).toHaveBeenCalledWith(5);
    });

    it('派生集合之外的类型被显式拒绝（不再落进某个分支）', async () => {
      await expect(service.restoreTrashItem('bogus', 1)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.restoreTrashItem('PmProject', 1)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('记录不在回收站时抛 404', async () => {
      await expect(service.restoreTrashItem('todo', 999)).rejects.toBeInstanceOf(NotFoundException);
      expect(repoFor('Todo').restore).not.toHaveBeenCalled();
    });
  });
});
