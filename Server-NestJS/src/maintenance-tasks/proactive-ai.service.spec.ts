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
});
