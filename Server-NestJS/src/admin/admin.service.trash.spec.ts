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

  beforeEach(async () => {
    eventsRepo = mockRepo();
    todosRepo = mockRepo();
    usersRepo = mockRepo();

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
        { provide: DataSource, useValue: {} },
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

  it('restoreTrashItem 不存在时抛 404', async () => {
    await expect(service.restoreTrashItem('todo', 999)).rejects.toBeInstanceOf(NotFoundException);
    expect(todosRepo.restore).not.toHaveBeenCalled();
  });
});
