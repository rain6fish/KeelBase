import { DataSource } from 'typeorm';
import { Event } from '../events/event.entity';
import { EventColorRole } from '../events/event-color-role.enum';
import { Todo } from '../todos/todo.entity';
import { KnowledgeArticle } from '../ai/rag/knowledge-article.entity';
import { AiConversation } from '../ai/conversation/ai-conversation.entity';
import { AiMessage } from '../ai/conversation/ai-message.entity';
import { Notification } from '../notifications/notification.entity';
import { User } from './entities/user.entity';

/**
 * 演示数据（PM-2 / DX-1）：为指定用户生成丰富的样例数据，
 * 让登录后界面有内容、直观展示全栈基座能力。
 *
 * 幂等：目标用户已有事件/待办/对话/通知时跳过（可安全重复执行）。
 * 供两处复用：SeedService 空库首启自动种入；`npm run seed:demo` 手动补种。
 */

export interface DemoUser {
  id: number;
  username: string;
}

export async function seedDemoData(
  dataSource: DataSource,
  user: DemoUser,
): Promise<boolean> {
  const eventRepo = dataSource.getRepository(Event);
  const todoRepo = dataSource.getRepository(Todo);
  const knowledgeRepo = dataSource.getRepository(KnowledgeArticle);
  const convRepo = dataSource.getRepository(AiConversation);
  const msgRepo = dataSource.getRepository(AiMessage);
  const notifRepo = dataSource.getRepository(Notification);

  // 幂等：已种过演示事件则跳过
  const existing = await eventRepo.count({ where: { userId: user.id } });
  if (existing > 0) return false;

  const day = 24 * 60 * 60 * 1000;
  const today = new Date();
  const at = (offsetDays: number, hour: number, minute = 0) => {
    const d = new Date(today.getTime() + offsetDays * day);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  // ── 事件：含今天/未来/已取消，展示 reminder 与颜色 ──────────
  await eventRepo.save([
    {
      userId: user.id,
      title: '项目评审会',
      description: '与团队评审 Q3 进度，重点对齐 AI 助手模块的交付计划。',
      startTime: at(0, 10, 0),
      endTime: at(0, 11, 30),
      location: '3F 会议室 A',
      colorRole: EventColorRole.blue,
      reminderMinutes: 30,
    },
    {
      userId: user.id,
      title: '午餐与客户会面',
      description: '与潜在客户沟通私有化部署需求，准备演示环境。',
      startTime: at(0, 12, 30),
      endTime: at(0, 14, 0),
      location: '公司旁餐厅',
      colorRole: EventColorRole.green,
      reminderMinutes: 15,
    },
    {
      userId: user.id,
      title: '产品周会',
      description: '同步本周进展与下周计划。',
      startTime: at(1, 9, 30),
      endTime: at(1, 10, 0),
      colorRole: EventColorRole.purple,
      isRecurring: true,
    },
    {
      userId: user.id,
      title: '健身房',
      description: '每周两次，保持状态。',
      startTime: at(1, 19, 0),
      endTime: at(1, 20, 0),
      location: '附近健身中心',
      colorRole: EventColorRole.orange,
      reminderMinutes: 60,
      isRecurring: true,
    },
    {
      userId: user.id,
      title: '技术分享：RAG 实践',
      description: '内部技术分享，介绍知识库向量检索的落地经验。',
      startTime: at(2, 15, 0),
      endTime: at(2, 16, 30),
      location: '线上会议',
      colorRole: EventColorRole.cyan,
      reminderMinutes: 10,
    },
    {
      userId: user.id,
      title: '拜访客户 A',
      description: '演示 AI 助手与数据主权方案。',
      startTime: at(3, 14, 0),
      endTime: at(3, 17, 0),
      location: '客户公司',
      colorRole: EventColorRole.blue,
      reminderMinutes: 60,
    },
    {
      userId: user.id,
      title: '已取消的会议',
      description: '本周例会已取消。',
      startTime: at(-1, 11, 0),
      endTime: at(-1, 12, 0),
      isCancelled: true,
      colorRole: EventColorRole.red,
    },
  ]);

  // ── 待办：部分完成，带截止日期 ────────────────────────────
  await todoRepo.save([
    {
      userId: user.id,
      title: '准备私有化部署演示环境',
      description: 'Docker + 演示数据 + 一键脚本走通。',
      completed: false,
      dueDate: at(0, 18, 0),
    },
    {
      userId: user.id,
      title: '整理 RAG 分享材料',
      description: '本周五技术分享用。',
      completed: false,
      dueDate: at(1, 18, 0),
    },
    {
      userId: user.id,
      title: '回复客户邮件',
      completed: false,
      dueDate: at(0, 15, 0),
    },
    {
      userId: user.id,
      title: '更新周报',
      completed: true,
    },
    {
      userId: user.id,
      title: '完成测试用例补充',
      description: '覆盖率提升到门槛以上。',
      completed: true,
    },
    {
      userId: user.id,
      title: '预约体检',
      completed: true,
    },
  ]);

  // ── 知识库：全局可见，供 RAG 问答（AI-3/AI-5）─────────────
  const kc = await knowledgeRepo.count();
  if (kc === 0) {
    await knowledgeRepo.save([
      {
        title: 'ShiYu-AppBase 是什么',
        category: '产品介绍',
        content:
          'ShiYu-AppBase 是一个生产级、AI 原生的全栈应用基座，覆盖 Flutter/Taro 三端 + NestJS 后端 + AI 编排，支持私有化部署，强调数据主权与企业级安全。',
      },
      {
        title: '如何启动后端',
        category: '开发指南',
        content:
          '进入 Server-Nodejs 目录，cp .env.example .env，npm install，npm run start:dev 即可启动开发后端，默认 SQLite 零配置，首次启动自动创建演示账号 alex / 123456。',
      },
      {
        title: 'AI 助手支持哪些能力',
        category: '使用说明',
        content:
          'AI 助手支持事件查询与统计、日程创建（人工确认）、待办管理、知识库问答（RAG）、数据洞察、页面导航，并支持 DeepSeek/Qwen/OpenAI/本地 Ollama 多模型切换与联网搜索。',
      },
      {
        title: '数据主权说明',
        category: '安全合规',
        content:
          '基座支持私有化部署，AI 可对接本地 Ollama 使数据不出域；敏感字段（手机号等）静态加密存储，管理端访问脱敏，满足企业数据安全要求。',
      },
    ]);
  }

  // ── AI 对话历史：两个会话，展示工具调用场景 ───────────────
  const convCount = await convRepo.count({
    where: { userId: String(user.id) },
  });
  if (convCount === 0) {
    const c1 = await convRepo.save(
      convRepo.create({
        userId: String(user.id),
        provider: 'deepseek',
        model: 'deepseek-chat',
        lastActivityAt: new Date(Date.now() - 2 * day),
      }),
    );
    await msgRepo.save([
      {
        conversationId: c1.id,
        role: 'user',
        content: '我这个月有哪些事件安排？',
      },
      {
        conversationId: c1.id,
        role: 'assistant',
        content:
          '你本月有 7 个事件安排，包括今天的项目评审会、明天的产品周会等。需要我帮你查看某个具体事件的详情吗？',
      },
    ]);

    const c2 = await convRepo.save(
      convRepo.create({
        userId: String(user.id),
        provider: 'deepseek',
        model: 'deepseek-chat',
        lastActivityAt: new Date(Date.now() - 1 * day),
      }),
    );
    await msgRepo.save([
      {
        conversationId: c2.id,
        role: 'user',
        content: '帮我创建一条明天的待办：提交季度总结',
      },
      {
        conversationId: c2.id,
        role: 'assistant',
        content:
          '好的，我已经为你创建了待办「提交季度总结」，截止时间为明天。你也可以让我创建日程事件或查询知识库内容。',
      },
    ]);

    await convRepo.update(
      { id: c1.id },
      { messageCount: 2, summary: '用户询问本月事件安排，助手返回了事件汇总。' },
    );
    await convRepo.update(
      { id: c2.id },
      { messageCount: 2, summary: '用户要求创建待办，助手成功创建。' },
    );
  }

  // ── 通知：欢迎 + 提醒 + 公告（含已读/未读）───────────────
  const notifCount = await notifRepo.count({ where: { userId: user.id } });
  if (notifCount === 0) {
    await notifRepo.save([
      {
        userId: user.id,
        title: '欢迎使用 ShiYu-AppBase',
        body: '这是一条演示通知。你可以在消息中心查看、标记已读或删除通知。',
        type: 'system',
        isRead: true,
        createdAt: new Date(Date.now() - 3 * day),
      },
      {
        userId: user.id,
        title: '事件提醒：项目评审会 30 分钟后开始',
        body: '「项目评审会」将在今天 10:00 开始（地点：3F 会议室 A）。',
        type: 'reminder',
        targetType: 'event',
        targetId: '',
        isRead: false,
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      },
      {
        userId: user.id,
        title: '公告：新增本地 AI（Ollama）支持',
        body: '现在可以对接本地 Ollama 模型，实现数据不出域的 AI 体验。详见文档。',
        type: 'broadcast',
        isRead: false,
        createdAt: new Date(Date.now() - 1 * day),
      },
    ]);
  }

  return true;
}
