import { seedDemoData } from './demo-data';
import { Event } from '../events/event.entity';
import { Todo } from '../todos/todo.entity';
import { KnowledgeArticle } from '../ai/rag/knowledge-article.entity';
import { AiConversation } from '../ai/conversation/ai-conversation.entity';
import { AiMessage } from '../ai/conversation/ai-message.entity';
import { Notification } from '../notifications/notification.entity';

function mockRepo() {
  return {
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn().mockResolvedValue({}),
    create: jest.fn((d: any) => d),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

describe('seedDemoData（PM-2 演示数据）', () => {
  function makeDataSource() {
    const repos = new Map<unknown, ReturnType<typeof mockRepo>>();
    for (const entity of [Event, Todo, KnowledgeArticle, AiConversation, AiMessage, Notification]) {
      repos.set(entity, mockRepo());
    }
    const dataSource = {
      getRepository: jest.fn((entity: unknown) => repos.get(entity)!),
    };
    return { dataSource, repos };
  }

  it('空库种入事件/待办/知识/对话/通知并返回 true', async () => {
    const { dataSource, repos } = makeDataSource();
    const result = await seedDemoData(dataSource as any, { id: 7, username: 'alex' });

    expect(result).toBe(true);
    expect(repos.get(Event)!.save).toHaveBeenCalled();
    expect(repos.get(Todo)!.save).toHaveBeenCalled();
    expect(repos.get(KnowledgeArticle)!.save).toHaveBeenCalled();
    expect(repos.get(AiConversation)!.save).toHaveBeenCalled();
    expect(repos.get(AiMessage)!.save).toHaveBeenCalled();
    expect(repos.get(Notification)!.save).toHaveBeenCalled();
    // 事件按 userId 校验幂等
    expect(repos.get(Event)!.count).toHaveBeenCalledWith({ where: { userId: 7 } });
  });

  it('已种过演示事件则跳过返回 false', async () => {
    const { dataSource, repos } = makeDataSource();
    repos.get(Event)!.count.mockResolvedValue(5);
    const result = await seedDemoData(dataSource as any, { id: 7, username: 'alex' });
    expect(result).toBe(false);
    expect(repos.get(Todo)!.save).not.toHaveBeenCalled();
  });

  it('知识库/对话/通知已存在时跳过对应保存', async () => {
    const { dataSource, repos } = makeDataSource();
    repos.get(KnowledgeArticle)!.count.mockResolvedValue(3);
    repos.get(AiConversation)!.count.mockResolvedValue(1);
    repos.get(Notification)!.count.mockResolvedValue(2);

    const result = await seedDemoData(dataSource as any, { id: 7, username: 'alex' });

    expect(result).toBe(true);
    expect(repos.get(KnowledgeArticle)!.save).not.toHaveBeenCalled();
    expect(repos.get(AiConversation)!.save).not.toHaveBeenCalled();
    expect(repos.get(Notification)!.save).not.toHaveBeenCalled();
    // 事件/待办仍会种
    expect(repos.get(Event)!.save).toHaveBeenCalled();
  });
});
