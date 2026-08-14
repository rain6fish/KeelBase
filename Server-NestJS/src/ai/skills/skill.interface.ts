/**
 * Skills（任务模板）定义
 */

export interface SkillTask {
  subAgent: string;
  query: string;
}

export interface SkillDefinition {
  name: string;
  /** 触发关键词（子串匹配） */
  triggerKeywords: string[];
  description: string;
  /** 固定子代理任务组合，顺序执行 */
  tasks: SkillTask[];
}
