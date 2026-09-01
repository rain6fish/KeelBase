// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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

function mockRepo() {
  return { find: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) };
}

describe('AdminService · 平台数据统计（PL-15）', () => {
  let service: AdminService;
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    dataSource = { query: jest.fn(), options: { type: 'better-sqlite3' } };
    // 按 SQL 内容分发结果（并发调用顺序不可靠）
    dataSource.query.mockImplementation(async (sql: string) => {
      const has = (s: string) => sql.includes(s);
      if (has('AS dau')) return [{ date: '2026-08-01', dau: 5 }];
      if (has('AS mau ')) return [{ mau: 20 }];
      if (has('AS mu ')) return [{ mu: 8 }];
      if (has('COUNT(*) AS total FROM users')) return [{ total: 50 }];
      if (has('EXISTS (SELECT 1 FROM op_audit_logs b')) return [{ r: 6 }];
      if (has('COUNT(DISTINCT userId) AS m FROM')) return [{ m: 18 }];
      if (has('GROUP BY action')) return [{ action: 'POST', count: 100 }];
      if (has('AS errors') && has('GROUP BY')) return [{ date: '2026-08-01', errors: 2 }];
      if (has('AS errors')) return [{ errors: 3 }];
      return [];
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: mockRepo() },
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
        { provide: DataSource, useValue: dataSource },
        { provide: EncryptionService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(AdminService);
  });

  it('getAnalytics 返回活跃/留存/漏斗/错误统计', async () => {
    const result = await service.getAnalytics(30);

    expect(result.activeUsers.mau).toBe(20);
    expect(result.activeUsers.wau).toBe(8);
    expect(result.activeUsers.totalUsers).toBe(50);
    expect(result.activeUsers.daily).toEqual([{ date: '2026-08-01', count: 5 }]);

    // 留存率 = retained/mau30 = 6/18 = 33.33
    expect(result.retention.ratePct).toBe(33.33);
    expect(result.retention.retained).toBe(6);

    expect(result.featureFunnel).toEqual([{ action: 'POST', count: 100 }]);
    expect(result.errors.aiErrors).toBe(3);
    expect(result.errors.trend).toEqual([{ date: '2026-08-01', count: 2 }]);
  });

  it('查询异常时返回空数组不抛错', async () => {
    dataSource.query.mockRejectedValue(new Error('boom'));
    const result = await service.getAnalytics(7);
    expect(result.activeUsers.daily).toEqual([]);
    expect(result.featureFunnel).toEqual([]);
  });
});
