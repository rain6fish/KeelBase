// SPDX-License-Identifier: Apache-2.0

import { ProactiveAiService } from './proactive-ai.service';

function mockRepo(overrides: Record<string, jest.Mock> = {}) {
  return { find: jest.fn().mockResolvedValue([]), ...overrides };
}

describe('ProactiveAiService（AI-15）', () => {
  let service: ProactiveAiService;
  let eventsRepo: ReturnType<typeof mockRepo>;
  let todosRepo: ReturnType<typeof mockRepo>;
  let usersRepo: ReturnType<typeof mockRepo>;
  let notificationsService: { create: jest.Mock };

  const makeService = (overrides: { withLlm?: boolean } = {}) => {
    eventsRepo = mockRepo();
    todosRepo = mockRepo();
    usersRepo = mockRepo();
    notificationsService = { create: jest.fn().mockResolvedValue({ id: 1 }) };

    const configService = { get: jest.fn((k: string, d?: unknown) => d) } as any;
    const factory = overrides.withLlm
      ? ({
          getProvider: jest.fn().mockReturnValue({
            generate: jest.fn().mockResolvedValue({ content: 'LLM 润色的摘要' }),
          }),
        } as any)
      : undefined;

    service = new ProactiveAiService(
      usersRepo as any,
      eventsRepo as any,
      todosRepo as any,
      notificationsService as any,
      configService,
      factory,
    );
  };

  it('无今日数据时跳过，不发通知', async () => {
    makeService();
    await service.sendDailyDigest();
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('有今日事件时向该用户发通知（规则式摘要）', async () => {
    makeService();
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0);
    eventsRepo.find.mockResolvedValue([{ id: 1, title: '晨会', startTime: start, endTime: start, userId: 1 }]);
    todosRepo.find.mockResolvedValue([]);
    usersRepo.find.mockResolvedValue([{ id: 1, username: 'alice' }]);

    await service.sendDailyDigest();

    expect(notificationsService.create).toHaveBeenCalledTimes(1);
    const call = notificationsService.create.mock.calls[0][0];
    expect(call.userId).toBe(1);
    expect(call.type).toBe('daily_digest');
    expect(call.title).toBe('今日日程速览');
    expect(call.body).toContain('今日 1 个事件');
  });

  it('有待办但无事件时也发通知', async () => {
    makeService();
    eventsRepo.find.mockResolvedValue([]);
    todosRepo.find.mockResolvedValue([{ id: 1, title: '交周报', completed: false, userId: 2 }]);
    usersRepo.find.mockResolvedValue([{ id: 2, username: 'bob' }]);

    await service.sendDailyDigest();

    expect(notificationsService.create).toHaveBeenCalledTimes(1);
    expect(notificationsService.create.mock.calls[0][0].body).toContain('交周报');
  });

  it('LLM 可用时用润色摘要', async () => {
    makeService({ withLlm: true });
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0);
    eventsRepo.find.mockResolvedValue([{ id: 1, title: '例会', startTime: start, endTime: start, userId: 1 }]);
    todosRepo.find.mockResolvedValue([]);
    usersRepo.find.mockResolvedValue([{ id: 1, username: 'alice' }]);

    await service.sendDailyDigest();

    expect(notificationsService.create.mock.calls[0][0].body).toBe('LLM 润色的摘要');
  });

  it('单用户通知失败不影响其他用户', async () => {
    makeService();
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0);
    eventsRepo.find.mockResolvedValue([
      { id: 1, title: 'A', startTime: start, endTime: start, userId: 1 },
    ]);
    todosRepo.find.mockResolvedValue([{ id: 1, title: 'B', completed: false, userId: 2 }]);
    usersRepo.find.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    notificationsService.create
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 2 });

    await expect(service.sendDailyDigest()).resolves.toBeUndefined();
    expect(notificationsService.create).toHaveBeenCalledTimes(2);
  });

  it('userId 为空的事件/待办被跳过（系统级记录不归属任何人）', async () => {
    makeService();
    const start = new Date();
    const today = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 10, 0);
    eventsRepo.find.mockResolvedValue([
      { id: 1, title: '无主事件', startTime: today, endTime: today, userId: null },
    ]);
    todosRepo.find.mockResolvedValue([{ id: 1, title: '无主待办', completed: false, userId: null }]);

    await service.sendDailyDigest();

    // 全部无主 → userIds 空 → 不查用户、不发通知
    expect(usersRepo.find).not.toHaveBeenCalled();
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('多事件按时间升序排列（摘要时间线有序）', async () => {
    makeService();
    const t = new Date();
    const at = (h: number) => new Date(t.getFullYear(), t.getMonth(), t.getDate(), h, 0);
    eventsRepo.find.mockResolvedValue([
      { id: 1, title: '下午会', startTime: at(15), endTime: at(15), userId: 1 },
      { id: 2, title: '晨会', startTime: at(9), endTime: at(9), userId: 1 },
    ]);
    todosRepo.find.mockResolvedValue([]);
    usersRepo.find.mockResolvedValue([{ id: 1, username: 'alice' }]);

    await service.sendDailyDigest();

    const body = notificationsService.create.mock.calls[0][0].body as string;
    expect(body.indexOf('晨会')).toBeLessThan(body.indexOf('下午会'));
  });

  it('LLM 润色失败时回退规则式摘要（不中断推送）', async () => {
    makeService({ withLlm: true });
    const t = new Date();
    const at = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 9, 0);
    eventsRepo.find.mockResolvedValue([
      { id: 1, title: '晨会', startTime: at, endTime: at, userId: 1 },
    ]);
    todosRepo.find.mockResolvedValue([]);
    usersRepo.find.mockResolvedValue([{ id: 1, username: 'alice' }]);
    (service as any).providerFactory.getProvider.mockReturnValue({
      generate: jest.fn().mockRejectedValue(new Error('LLM down')),
    });

    await service.sendDailyDigest();

    const body = notificationsService.create.mock.calls[0][0].body as string;
    expect(body).toContain('今日 1 个事件');
    expect(body).toContain('晨会');
  });
});
