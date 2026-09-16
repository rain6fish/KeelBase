// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
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
import { PmProject } from '../pm/pm-project.entity';
import { PmTask } from '../pm/pm-task.entity';
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

describe('AdminService · 回收站（RG-3）', () => {
  let service: AdminService;
  let eventsRepo: ReturnType<typeof mockRepo>;
  let todosRepo: ReturnType<typeof mockRepo>;
  let usersRepo: ReturnType<typeof mockRepo>;
  // project/task 走 dataSource.getRepository（不为两处只读访问新增构造器依赖）
  let projectsRepo: ReturnType<typeof mockRepo>;
  let tasksRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    eventsRepo = mockRepo();
    todosRepo = mockRepo();
    usersRepo = mockRepo();
    projectsRepo = mockRepo();
    tasksRepo = mockRepo();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Event), useValue: eventsRepo },
        { provide: getRepositoryToken(Todo), useValue: todosRepo },
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
            getRepository: jest.fn((entity: unknown) =>
              entity === PmProject ? projectsRepo : tasksRepo,
            ),
          },
        },
        { provide: EncryptionService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(AdminService);
  });

  it('getTrash 列出已删除事件与待办并带用户名', async () => {
    eventsRepo.find.mockResolvedValue([
      { id: 1, title: '删掉的事件', userId: 1, deletedAt: new Date('2026-08-08T00:00:00Z') },
    ]);
    todosRepo.find.mockResolvedValue([
      { id: 2, title: '删掉的待办', userId: 2, deletedAt: new Date('2026-08-07T00:00:00Z') },
    ]);
    usersRepo.find.mockResolvedValue([
      { id: 1, username: 'alice' },
      { id: 2, username: 'bob' },
    ]);

    const result = await service.getTrash(1, 20);

    expect(result.items.length).toBe(2);
    expect(result.items[0].type).toBe('event');
    expect(result.items[0].username).toBe('alice');
    expect(result.items[1].type).toBe('todo');
    expect(result.items[1].username).toBe('bob');
  });

  it('restoreTrashItem 恢复存在记录', async () => {
    eventsRepo.findOne.mockResolvedValue({ id: 1, title: 'x', deletedAt: new Date() });

    const result = await service.restoreTrashItem('event', 1);

    expect(eventsRepo.restore).toHaveBeenCalledWith(1);
    expect(result).toEqual({ restored: true, type: 'event', id: 1 });
  });

  it('getTrash 覆盖复合写载体：project 用 name 作标题、task 用 title（级联撤销目标可恢复）', async () => {
    projectsRepo.find.mockResolvedValue([
      { id: 7, name: '级联验收项目', userId: 1, deletedAt: new Date('2026-09-16T10:00:00Z') },
    ]);
    tasksRepo.find.mockResolvedValue([
      { id: 88, title: '梳理干系人', userId: 1, deletedAt: new Date('2026-09-16T09:00:00Z') },
    ]);
    usersRepo.find.mockResolvedValue([{ id: 1, username: 'alice' }]);
    projectsRepo.count.mockResolvedValue(1);
    tasksRepo.count.mockResolvedValue(1);

    const result = await service.getTrash(1, 20);

    expect(result.items).toHaveLength(2);
    // 项目展示列是 name（不是 title）——与 resolveLocalEntity 的 displayCol 推导同口径
    expect(result.items[0]).toMatchObject({ type: 'project', id: 7, title: '级联验收项目', username: 'alice' });
    expect(result.items[1]).toMatchObject({ type: 'task', id: 88, title: '梳理干系人' });
    expect(result.total).toBe(2); // 计数含 pm_*（否则前端分页数缺失）
  });

  it('restoreTrashItem 可恢复 project / task（走 dataSource.getRepository）', async () => {
    projectsRepo.findOne.mockResolvedValue({ id: 7, name: 'P', deletedAt: new Date() });
    tasksRepo.findOne.mockResolvedValue({ id: 88, title: 'T', deletedAt: new Date() });

    await expect(service.restoreTrashItem('project', 7)).resolves.toEqual({
      restored: true,
      type: 'project',
      id: 7,
    });
    expect(projectsRepo.restore).toHaveBeenCalledWith(7);

    await expect(service.restoreTrashItem('task', 88)).resolves.toEqual({
      restored: true,
      type: 'task',
      id: 88,
    });
    expect(tasksRepo.restore).toHaveBeenCalledWith(88);
  });

  it('restoreTrashItem 不存在时抛 404', async () => {
    await expect(service.restoreTrashItem('todo', 999)).rejects.toBeInstanceOf(NotFoundException);
    expect(todosRepo.restore).not.toHaveBeenCalled();
  });
});
