import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAgent } from './ai-agent.entity';

export interface AgentSource {
  name: string;
  ownerUserId?: number;
}

/**
 * D5 Agent Registry（roadmap §22.10）：已注册 Agent 清单（企业可信的可见呈现）。
 * 最小版本：list + 从 headless API Key 自动注册（key 名 = agent 名）。
 * 子 agent（运行时归责）后续接入；不做复杂 IAM。
 */
@Injectable()
export class AiAgentService {
  constructor(
    @InjectRepository(AiAgent)
    private readonly repo: Repository<AiAgent>,
  ) {}

  list(): Promise<AiAgent[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  /** 从 headless keys 幂等注册：存在则更新 owner/purpose，不存在则创建（trustLevel 默认 R1）。 */
  async upsertFromHeadless(sources: AgentSource[]): Promise<number> {
    let created = 0;
    for (const s of sources) {
      if (!s.name || !s.name.trim()) continue;
      const existing = await this.repo.findOne({ where: { name: s.name } });
      if (existing) {
        if (s.ownerUserId != null && existing.ownerId !== s.ownerUserId) {
          existing.ownerId = s.ownerUserId;
          existing.purpose = existing.purpose ?? `headless API key「${s.name}」`;
          await this.repo.save(existing);
        }
      } else {
        await this.repo.save(
          this.repo.create({
            name: s.name,
            ownerId: s.ownerUserId,
            purpose: `headless API key「${s.name}」`,
            trustLevel: 'R1',
          }),
        );
        created += 1;
      }
    }
    return created;
  }
}
