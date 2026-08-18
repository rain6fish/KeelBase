import { PluginsService } from './plugins.service';
import { PluginsController } from './plugins.controller';
import { APPROVAL_INTAKE_PLUGIN } from '../../scripts/examples/approval-intake.plugin';
import { PluginManifest } from './plugin.interface';

/**
 * PL-11 第三方插件安装路径集成测试（approval-intake 示例旗舰插件）。
 *
 * 与 plugins.service.spec.ts 相同的方式构造 PluginsService，但注入真实示例插件
 * manifest（Server-NestJS/scripts/examples/approval-intake.plugin.ts，即
 * `keelbase-plugin add` 复制进 src/plugins/plugins/ 的同源文件），验证完整闭环：
 *   安装（加入 PLUGINS）→ 加载 → 注册路由 → 处理器对样例请求返回预期结果 → 未安装时不注册。
 */

function makeService(overrides: {
  flags?: Record<string, boolean>;
  services?: Record<string, unknown>;
  plugins?: PluginManifest[];
}) {
  const flags = overrides.flags ?? {};
  const featureFlags = {
    isEnabled: jest.fn((k: string) => flags[k] ?? true),
  } as any;
  const services = overrides.services ?? {};
  const resolver = (name: string) => services[name] ?? null;
  const plugins = overrides.plugins ?? [];
  return new PluginsService(featureFlags, resolver, plugins);
}

describe('PluginsService × approval-intake 插件（第三方安装路径集成）', () => {
  it('安装后：加载插件、注册路由、处理器对样例请求返回预期结果', async () => {
    const service = makeService({
      flags: { approval: true },
      services: { ApprovalService: { reviewRequest: jest.fn() } },
      plugins: [APPROVAL_INTAKE_PLUGIN],
    });

    await service.onApplicationBootstrap();

    // 插件已加载
    expect(service.listPlugins().map((p) => p.name)).toContain('approval-intake');

    // 路由已注册
    const route = service.getRoutes().find((r) => r.path === '/plugins/approval-intake/precheck');
    expect(route).toBeDefined();

    // 低风险样例：金额 ≤ 阈值 → low / 自动通过
    const low = await route!.handler({ type: '报销', amount: 500 });
    expect(low).toEqual({
      plugin: 'approval-intake',
      ok: true,
      precheck: { type: '报销', amount: 500, riskLevel: 'low', recommendation: '自动通过（金额 ≤ ¥1000 阈值）' },
      host: { approvalServiceAvailable: true, approvalFeatureEnabled: true },
    });

    // 高风险样例：金额 > 3×阈值 → high / 转人工复核
    const high = await route!.handler({ amount: 5000 });
    expect(high.precheck.riskLevel).toBe('high');
    expect(high.precheck.recommendation).toContain('转人工复核');

    // 防御式输入：非对象 body 兜底为 general / 0
    const garbage = await route!.handler('not-an-object');
    expect(garbage.precheck).toEqual({ type: 'general', amount: 0, riskLevel: 'low', recommendation: expect.any(String) });
  });

  it('未安装（不在 PLUGINS）：getRoutes 不含该路由 —— 对应控制器 not-found 分支', async () => {
    const service = makeService({ plugins: [] });
    await service.onApplicationBootstrap();
    expect(service.getRoutes().some((r) => r.path === '/plugins/approval-intake/precheck')).toBe(false);

    // 走真实控制器派发：未注册路径返回错误对象
    const controller = new PluginsController(service);
    await expect(controller.invoke('approval-intake/precheck', {})).resolves.toEqual({
      error: '插件路由 /plugins/approval-intake/precheck 不存在',
    });
  });

  it('requires 依赖缺失（ApprovalService 未装配）时跳过插件', async () => {
    const service = makeService({
      flags: { approval: true },
      services: {},
      plugins: [APPROVAL_INTAKE_PLUGIN],
    });
    await service.onApplicationBootstrap();
    expect(service.listPlugins()).toHaveLength(0);
  });

  it('featureFlag 关闭（approval=false）时跳过插件', async () => {
    const service = makeService({
      flags: { approval: false },
      services: { ApprovalService: { reviewRequest: jest.fn() } },
      plugins: [APPROVAL_INTAKE_PLUGIN],
    });
    await service.onApplicationBootstrap();
    expect(service.listPlugins()).toHaveLength(0);
  });
});
