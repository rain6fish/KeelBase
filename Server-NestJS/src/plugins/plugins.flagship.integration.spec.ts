// SPDX-License-Identifier: Apache-2.0

import { PluginsService } from './plugins.service';
import { PluginsController } from './plugins.controller';
import { PluginManifest } from './plugin.interface';
import { CRM_IMPORT_WEBHOOK_PLUGIN } from '../../scripts/examples/crm-import-webhook.plugin';
import { PM_DEADLINE_NOTIFY_PLUGIN } from '../../scripts/examples/pm-deadline-notify.plugin';
import { APPROVAL_ESCALATION_PLUGIN } from '../../scripts/examples/approval-escalation.plugin';

/**
 * PL-11 第三方风格官方示例插件集成测试（crm-import-webhook / pm-deadline-notify / approval-escalation）。
 *
 * 与 plugins.integration.spec.ts（approval-intake）相同的方式构造 PluginsService，注入真实示例插件
 * manifest（Server-NestJS/scripts/examples/ 下三个自包含源文件，即 `keelbase-plugin add` 复制进
 * src/plugins/plugins/ 的同源文件），验证完整闭环：
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

describe('PluginsService × 三旗舰第三方插件（安装路径集成）', () => {
  // ── crm-import-webhook（CRM 客户导入标准化）────────────────────────────

  describe('crm-import-webhook', () => {
    it('安装后：加载插件、注册路由、处理器对样例请求返回预期结果', async () => {
      const service = makeService({
        flags: { crm: true },
        services: { CrmService: { listCustomers: jest.fn() } },
        plugins: [CRM_IMPORT_WEBHOOK_PLUGIN],
      });
      await service.onApplicationBootstrap();

      expect(service.listPlugins().map((p) => p.name)).toContain('crm-import-webhook');
      const route = service.getRoutes().find((r) => r.path === '/plugins/crm-import-webhook/normalize');
      expect(route).toBeDefined();

      // 高价值线索：字段清洗（trim/去重空格/邮箱小写）+ 价值分级 high
      const lead = await route!.handler({
        name: '  张 三 ',
        email: '  Alice@Example.COM ',
        company: 'ACME 科技',
        amount: 150000,
      });
      expect(lead).toEqual({
        plugin: 'crm-import-webhook',
        ok: true,
        lead: {
          name: '张 三',
          email: 'alice@example.com',
          company: 'ACME 科技',
          amount: 150000,
          valueTier: 'high',
          warnings: ['高价值线索：金额 ≥ ¥100,000，建议优先跟进'],
        },
        host: { crmServiceAvailable: true, crmFeatureEnabled: true },
      });

      // 邮箱格式非法 → 置空 + 警告
      const invalid = await route!.handler({ email: 'bad-email', amount: 500 });
      expect(invalid.lead.email).toBeNull();
      expect(invalid.lead.valueTier).toBe('low');
      expect(invalid.lead.warnings).toContain('email 格式无效：bad-email');

      // 防御式输入：非对象 body 兜底为空字段
      const garbage = await route!.handler('not-an-object');
      expect(garbage.lead).toEqual({
        name: '',
        email: null,
        company: '',
        amount: 0,
        valueTier: 'low',
        warnings: ['email 缺失'],
      });
    });

    it('requires 依赖缺失（CrmService 未装配）时跳过插件', async () => {
      const service = makeService({ flags: { crm: true }, services: {}, plugins: [CRM_IMPORT_WEBHOOK_PLUGIN] });
      await service.onApplicationBootstrap();
      expect(service.listPlugins()).toHaveLength(0);
      expect(service.getRoutes().some((r) => r.path === '/plugins/crm-import-webhook/normalize')).toBe(false);
    });

    it('featureFlag 关闭（crm=false）时跳过插件', async () => {
      const service = makeService({
        flags: { crm: false },
        services: { CrmService: { listCustomers: jest.fn() } },
        plugins: [CRM_IMPORT_WEBHOOK_PLUGIN],
      });
      await service.onApplicationBootstrap();
      expect(service.listPlugins()).toHaveLength(0);
    });
  });

  // ── pm-deadline-notify（项目截止预警）────────────────────────────────

  describe('pm-deadline-notify', () => {
    const dayMs = 24 * 60 * 60 * 1000;

    it('安装后：加载插件、注册路由、扫描逾期 + 临期项', async () => {
      const service = makeService({
        flags: { pm: true },
        services: { PmService: { analyzeProjectRisk: jest.fn() } },
        plugins: [PM_DEADLINE_NOTIFY_PLUGIN],
      });
      await service.onApplicationBootstrap();

      expect(service.listPlugins().map((p) => p.name)).toContain('pm-deadline-notify');
      const route = service.getRoutes().find((r) => r.path === '/plugins/pm-deadline-notify/scan');
      expect(route).toBeDefined();

      const now = Date.now();
      const scan = await route!.handler({
        items: [
          { name: '里程碑A', dueDate: new Date(now - dayMs).toISOString(), status: 'pending' }, // 逾期
          { name: '任务B', dueDate: new Date(now + dayMs).toISOString(), status: 'pending' }, // 临期（≤3 天）
          { name: '任务C', dueDate: new Date(now + 30 * dayMs).toISOString() }, // 远期
          { name: '已完成', dueDate: new Date(now - 2 * dayMs).toISOString(), status: 'completed' }, // 不计逾期
          { name: '坏日期', dueDate: 'not-a-date' }, // 跳过
        ],
      });
      expect(scan).toEqual({
        plugin: 'pm-deadline-notify',
        ok: true,
        scan: { totalCount: 4, overdueCount: 1, nearDueCount: 1, nearDays: 3 },
        host: { pmServiceAvailable: true, pmFeatureEnabled: true },
      });

      // nearDays 收窄为 1 天后，5 天外的项不再临期
      const narrow = await route!.handler({
        items: [{ name: 'X', dueDate: new Date(now + 5 * dayMs).toISOString() }],
        nearDays: 1,
      });
      expect(narrow.scan).toEqual({ totalCount: 1, overdueCount: 0, nearDueCount: 0, nearDays: 1 });

      // 防御式输入：非对象 body 兜底为空扫描
      const garbage = await route!.handler('not-an-object');
      expect(garbage.scan).toEqual({ totalCount: 0, overdueCount: 0, nearDueCount: 0, nearDays: 3 });
    });

    it('requires 依赖缺失（PmService 未装配）时跳过插件', async () => {
      const service = makeService({ flags: { pm: true }, services: {}, plugins: [PM_DEADLINE_NOTIFY_PLUGIN] });
      await service.onApplicationBootstrap();
      expect(service.listPlugins()).toHaveLength(0);
      expect(service.getRoutes().some((r) => r.path === '/plugins/pm-deadline-notify/scan')).toBe(false);
    });

    it('featureFlag 关闭（pm=false）时跳过插件', async () => {
      const service = makeService({
        flags: { pm: false },
        services: { PmService: { analyzeProjectRisk: jest.fn() } },
        plugins: [PM_DEADLINE_NOTIFY_PLUGIN],
      });
      await service.onApplicationBootstrap();
      expect(service.listPlugins()).toHaveLength(0);
    });
  });

  // ── approval-escalation（审批 SLA 升级评估）───────────────────────────

  describe('approval-escalation', () => {
    it('安装后：加载插件、注册路由、按等待时长分级 + 金额兜底', async () => {
      const service = makeService({
        flags: { approval: true },
        services: { ApprovalService: { reviewRequest: jest.fn() } },
        plugins: [APPROVAL_ESCALATION_PLUGIN],
      });
      await service.onApplicationBootstrap();

      expect(service.listPlugins().map((p) => p.name)).toContain('approval-escalation');
      const route = service.getRoutes().find((r) => r.path === '/plugins/approval-escalation/evaluate');
      expect(route).toBeDefined();

      // ≥24h → 升级经理
      const l2 = await route!.handler({ waitMinutes: 2000, amount: 5000 });
      expect(l2).toEqual({
        plugin: 'approval-escalation',
        ok: true,
        evaluation: { waitMinutes: 2000, tier: 'level2', highValue: false, recommendation: '等待 ≥ 24h：升级至经理审批' },
        host: { approvalServiceAvailable: true, approvalFeatureEnabled: true },
      });

      // ≥8h → 升级主管
      const l1 = await route!.handler({ waitMinutes: 600 });
      expect(l1.evaluation.tier).toBe('level1');

      // SLA 内但高金额 → 加急复核兜底
      const hv = await route!.handler({ waitMinutes: 60, amount: 150000 });
      expect(hv.evaluation).toEqual({
        waitMinutes: 60,
        tier: 'on_sla',
        highValue: true,
        recommendation: 'SLA 内但金额 ≥ ¥100,000：建议加急复核',
      });

      // SLA 内正常
      const ok = await route!.handler({ waitMinutes: 60 });
      expect(ok.evaluation.tier).toBe('on_sla');

      // 由 submittedAt 推导等待时长（约 30 分钟）
      const derived = await route!.handler({ submittedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() });
      expect(derived.evaluation.waitMinutes).toBeGreaterThanOrEqual(29);
      expect(derived.evaluation.waitMinutes).toBeLessThanOrEqual(31);

      // 防御式输入：非对象 body 兜底为 on_sla
      const garbage = await route!.handler('not-an-object');
      expect(garbage.evaluation).toEqual({
        waitMinutes: 0,
        tier: 'on_sla',
        highValue: false,
        recommendation: 'SLA 内，保持正常处理',
      });
    });

    it('requires 依赖缺失（ApprovalService 未装配）时跳过插件', async () => {
      const service = makeService({ flags: { approval: true }, services: {}, plugins: [APPROVAL_ESCALATION_PLUGIN] });
      await service.onApplicationBootstrap();
      expect(service.listPlugins()).toHaveLength(0);
      expect(service.getRoutes().some((r) => r.path === '/plugins/approval-escalation/evaluate')).toBe(false);
    });

    it('featureFlag 关闭（approval=false）时跳过插件', async () => {
      const service = makeService({
        flags: { approval: false },
        services: { ApprovalService: { reviewRequest: jest.fn() } },
        plugins: [APPROVAL_ESCALATION_PLUGIN],
      });
      await service.onApplicationBootstrap();
      expect(service.listPlugins()).toHaveLength(0);
    });
  });

  // ── 共存 / 未安装 ────────────────────────────────────────────────────

  it('三个第三方插件共存：全部安装时三条路由都注册', async () => {
    const service = makeService({
      flags: { crm: true, pm: true, approval: true },
      services: {
        CrmService: { listCustomers: jest.fn() },
        PmService: { analyzeProjectRisk: jest.fn() },
        ApprovalService: { reviewRequest: jest.fn() },
      },
      plugins: [CRM_IMPORT_WEBHOOK_PLUGIN, PM_DEADLINE_NOTIFY_PLUGIN, APPROVAL_ESCALATION_PLUGIN],
    });
    await service.onApplicationBootstrap();

    expect(service.listPlugins().map((p) => p.name).sort()).toEqual([
      'approval-escalation',
      'crm-import-webhook',
      'pm-deadline-notify',
    ]);
    expect(service.getRoutes().map((r) => r.path).sort()).toEqual([
      '/plugins/approval-escalation/evaluate',
      '/plugins/crm-import-webhook/normalize',
      '/plugins/pm-deadline-notify/scan',
    ]);
  });

  it('未安装（不在 PLUGINS）：三条路由均不注册 —— 对应控制器 not-found 分支', async () => {
    const service = makeService({ plugins: [] });
    await service.onApplicationBootstrap();
    expect(service.getRoutes()).toHaveLength(0);

    const controller = new PluginsController(service);
    await expect(controller.invoke('crm-import-webhook/normalize', {})).resolves.toEqual({
      error: '插件路由 /plugins/crm-import-webhook/normalize 不存在',
    });
    await expect(controller.invoke('pm-deadline-notify/scan', {})).resolves.toEqual({
      error: '插件路由 /plugins/pm-deadline-notify/scan 不存在',
    });
    await expect(controller.invoke('approval-escalation/evaluate', {})).resolves.toEqual({
      error: '插件路由 /plugins/approval-escalation/evaluate 不存在',
    });
  });
});
