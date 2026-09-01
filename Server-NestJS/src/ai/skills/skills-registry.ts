// SPDX-License-Identifier: Apache-2.0

/**
 * Skills 注册表 — 命名任务模板
 *
 * 技能命中 → 使用固定子代理组合（确定性、零 LLM 分解），
 * 未命中 → 交给子代理编排器做 LLM 分解。
 */

import { SkillDefinition } from './skill.interface';

export const WEEK_PLAN_SKILL: SkillDefinition = {
  name: 'week-plan',
  triggerKeywords: [
    '安排本周',
    '安排这周',
    '规划本周',
    '规划这周',
    '本周安排',
    '这周安排',
    '本周计划',
    '周计划',
    '周安排',
  ],
  description: '为本周生成日程安排建议（查询日程 → 统计状态 → 给出建议）',
  tasks: [
    {
      subAgent: 'calendar',
      query: '查询本周（周一到周日）全部事件，按天整理，列出名称、起止时间和状态。',
    },
    {
      subAgent: 'stats',
      query: '统计本周事件的完成状态分布（已完成/进行中/待办/已取消）和数量。',
    },
    {
      subAgent: 'organizer',
      query: '综合本周日程与统计，识别冲突，输出优先级排序和每天的时间分配建议。',
    },
  ],
};

export const DEFAULT_SKILLS: SkillDefinition[] = [WEEK_PLAN_SKILL];

export class SkillsRegistry {
  constructor(private readonly skills: SkillDefinition[]) {}

  /** 返回第一个触发关键词命中的技能；无命中返回 null。 */
  match(request: string): SkillDefinition | null {
    for (const skill of this.skills) {
      if (skill.triggerKeywords.some((k) => request.includes(k))) {
        return skill;
      }
    }
    return null;
  }

  getAll(): SkillDefinition[] {
    return this.skills;
  }
}
