import { SkillsRegistry, DEFAULT_SKILLS, WEEK_PLAN_SKILL } from './skills-registry';

describe('SkillsRegistry', () => {
  const registry = new SkillsRegistry(DEFAULT_SKILLS);

  it('should match a skill by triggering keyword', () => {
    expect(registry.match('帮我安排本周')).toBe(WEEK_PLAN_SKILL);
    expect(registry.match('规划这周的日程')).toBe(WEEK_PLAN_SKILL);
    expect(registry.match('本周计划怎么做')).toBe(WEEK_PLAN_SKILL);
  });

  it('should return null when no keyword matches', () => {
    expect(registry.match('本周事件有哪些')).toBeNull();
    expect(registry.match('今天天气怎么样')).toBeNull();
    expect(registry.match('打开设置')).toBeNull();
  });

  it('should return all registered skills', () => {
    expect(registry.getAll()).toContain(WEEK_PLAN_SKILL);
    expect(registry.getAll().length).toBeGreaterThan(0);
  });

  it('week-plan skill has calendar → stats → organizer tasks in order', () => {
    expect(WEEK_PLAN_SKILL.tasks.map((t) => t.subAgent)).toEqual([
      'calendar',
      'stats',
      'organizer',
    ]);
  });
});
