/**
 * 用户长期记忆服务 — MemoriesService
 *
 * 跨会话保存用户事实/偏好，注入 AI 系统提示词。
 * 抽取为规则式（正则，零 LLM token），fire-and-forget，不阻塞对话。
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { UserMemory } from './user-memory.entity';

export type MemoryType = 'fact' | 'preference' | 'identity';

const MAX_MEMORIES_PER_USER = 200;

/** 抽取规则：{ pattern, type, render } */
const RULES: Array<{
  pattern: RegExp;
  type: MemoryType;
  render: (match: string) => string;
}> = [
  {
    pattern: /叫我([一-龥A-Za-z0-9]+?)(?:吧|就行|就好)?(?![一-龥A-Za-z0-9])/,
    type: 'identity',
    render: (m) => `用户称呼：${m}`,
  },
  {
    pattern: /(?:我的名字?(?:是|叫)|我(?:的)?昵称是)([一-龥A-Za-z0-9]{1,12})/,
    type: 'identity',
    render: (m) => `用户名字：${m}`,
  },
  {
    pattern: /我喜欢([^。！!？?\n]{2,30})/,
    type: 'preference',
    render: (m) => `用户喜欢：${m}`,
  },
  {
    pattern: /我(?:不)?习惯([^。！!？?\n]{2,30})/,
    type: 'preference',
    render: (m) => `用户习惯：${m}`,
  },
  {
    pattern: /我的生日(?:是|在)([^。！!？?\n]{2,20})/,
    type: 'fact',
    render: (m) => `用户生日：${m}`,
  },
  {
    pattern: /我(?:每周|每月|每天早上|每天晚上|平时)([^。！!？?\n]{2,40})/,
    type: 'fact',
    render: (m) => `用户规律：${m}`,
  },
];

@Injectable()
export class MemoriesService {
  constructor(
    @InjectRepository(UserMemory)
    private readonly repo: Repository<UserMemory>,
  ) {}

  /** 按 (userId, content) 去重写入；超上限时删除最旧。 */
  async create(
    userId: string,
    type: MemoryType,
    content: string,
    source?: string,
  ): Promise<UserMemory | null> {
    const existing = await this.repo.findOne({ where: { userId, content } });
    if (existing) {
      return null;
    }

    const count = await this.repo.count({ where: { userId } });
    if (count >= MAX_MEMORIES_PER_USER) {
      const oldest = await this.repo.findOne({
        where: { userId },
        order: { createdAt: 'ASC' },
      });
      if (oldest) {
        await this.repo.remove(oldest);
      }
    }

    const memory = this.repo.create({
      userId,
      type,
      content,
      ...(source ? { source } : {}),
    });
    return this.repo.save(memory);
  }

  /** 规则式抽取：从用户一句话中提取记忆，fire-and-forget。 */
  async extractFromTurn(
    userId: string,
    userMessage: string,
    source?: string,
  ): Promise<void> {
    for (const rule of RULES) {
      const match = rule.pattern.exec(userMessage);
      if (match && match[1]) {
        await this.create(userId, rule.type, rule.render(match[1].trim()), source);
      }
    }
  }

  /** 按 lastUsedAt（未用过的按 createdAt）排序，过滤过期，返回前 limit 条。 */
  async getForUser(
    userId: string,
    limit = 8,
  ): Promise<Array<{ content: string; type: MemoryType }>> {
    const rows = await this.repo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      take: limit * 3,
    });
    const now = Date.now();
    return rows
      .filter((r) => !r.expiresAt || r.expiresAt.getTime() > now)
      .sort((a, b) => {
        const at = a.lastUsedAt?.getTime() ?? a.createdAt.getTime();
        const bt = b.lastUsedAt?.getTime() ?? b.createdAt.getTime();
        return bt - at;
      })
      .slice(0, limit)
      .map((r) => ({ content: r.content, type: r.type as MemoryType }));
  }

  /** 记录记忆被使用的时间（提升相关度排序）。 */
  async markUsed(userId: string, contents: string[]): Promise<void> {
    if (contents.length === 0) return;
    await this.repo.update(
      { userId, content: In(contents) },
      { lastUsedAt: new Date() },
    );
  }

  /** 清除用户全部记忆（隐私）。 */
  async deleteAllForUser(userId: string): Promise<void> {
    await this.repo.delete({ userId });
  }

  /** 清理过期记忆，返回删除条数。 */
  async pruneExpired(): Promise<number> {
    const result = await this.repo.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected ?? 0;
  }
}
