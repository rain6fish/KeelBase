// SPDX-License-Identifier: Apache-2.0

import {
  MODULES_MANIFEST,
  validateModuleGraph,
  CORE_MODULES,
  AI_MODULES,
  NOTIFICATION_MODULES,
} from './modules-manifest';

describe('MOD-1 模块清单与依赖图谱', () => {
  const allEnabled = () => new Set(MODULES_MANIFEST.map((m) => m.id));

  it('manifest 覆盖全部类别模块', () => {
    const ids = MODULES_MANIFEST.map((m) => m.id);
    for (const c of CORE_MODULES) expect(ids).toContain(c);
    for (const a of AI_MODULES) expect(ids).toContain(a);
    for (const n of NOTIFICATION_MODULES) expect(ids).toContain(n);
    expect(ids).toContain('events');
    expect(ids).toContain('todos');
    expect(ids).toContain('org');
  });

  it('全部启用时校验通过', () => {
    const result = validateModuleGraph(allEnabled());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('缺少核心模块时校验失败', () => {
    const enabled = allEnabled();
    enabled.delete('auth');
    const result = validateModuleGraph(enabled);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain('auth');
  });

  it('AI 模块不同开同关时校验失败', () => {
    const enabled = allEnabled();
    enabled.delete('knowledge'); // 开了 ai 但关 knowledge
    const result = validateModuleGraph(enabled);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ai') && e.includes('knowledge'))).toBe(true);
  });

  it('启用 events 但关 notifications 时校验失败', () => {
    const enabled = allEnabled();
    enabled.delete('notifications');
    const result = validateModuleGraph(enabled);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('events') && e.includes('notifications'))).toBe(true);
  });

  it('业务模块可独立关闭（关 todos 合法）', () => {
    const enabled = allEnabled();
    enabled.delete('todos');
    expect(validateModuleGraph(enabled).valid).toBe(true);
  });
});
