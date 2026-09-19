// SPDX-License-Identifier: Apache-2.0

/**
 * AI 每日用量配额（从 `AuditService` 拆出的第四个领域，健康清单 §3 阶段 3）。
 *
 * 它**本来就不属于审计**：审计关心「发生了什么」，配额关心「今天还能用多少」——
 * 只是历史上被塞进了同一个类。拆开后 `AuditService` 只剩真正的写链职责。
 *
 * 实现要点（原样保留）：并发下用**原子条件 UPDATE**（`where count < limit`）替代「读-判-写」，
 * 消除并发请求同时读到同一 used 而集体越限的问题；首写行不存在时先建 `count=0` 再递增。
 *
 * 注：实体 `AiDailyUsage` 仍在 `audit/` 下（还被独立治理面引用），把它搬去 `usage/` 会牵动迁移配置，
 * 属另一件事，本刀不动。
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { AiDailyUsage } from './ai-daily-usage.entity';

@Injectable()
export class AiDailyUsageService {
  constructor(
    @InjectRepository(AiDailyUsage)
    private readonly usageRepo: Repository<AiDailyUsage>,
  ) {}

  /**
   * RG-2.1 原子预留：AI 每日限额（ai_daily_limit）并发下不超限。
   * 用原子条件 UPDATE（where count < limit）替代「读-判-写」，与 headless 配额同模式——
   * 并发请求同时读到同一 used 集体越限的问题由此消除。
   * 返回 true=预留成功（本次对话已计入限额）；false=已达限额。首写行不存在时先建 count=0。
   */
  async reserveDailyUsage(userId: string, limit: number): Promise<boolean> {
    const usageDate = this._todayKey();
    try {
      await this.usageRepo.save(this.usageRepo.create({ userId, usageDate, count: 0 }));
    } catch {
      // 行已存在（含并发首写唯一约束冲突）——忽略，走原子条件递增
    }
    const criteria: any = { userId, usageDate };
    if (limit > 0) criteria.count = LessThan(limit);
    const res = await this.usageRepo.update(criteria, { count: () => 'count + 1' });
    return res.affected === 1;
  }

  /** 对话错误/失败时释放预留槽（保底：count>0 才递减，防负值）。 */
  async releaseDailyUsage(userId: string): Promise<void> {
    const usageDate = this._todayKey();
    await this.usageRepo.update(
      { userId, usageDate, count: MoreThan(0) },
      { count: () => 'count - 1' },
    );
  }

  private _todayKey(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
