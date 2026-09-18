// SPDX-License-Identifier: Apache-2.0

/**
 * BA 异常行为基线单元测试（docs/ai-behavior-baseline.spec.md §8）。
 *
 * 断言都选在「实现错就必然出事」的观测面：**恰好等于阈值不告警**（边界）、超一个才告警、
 * 低危工具不误报、未知工具不误报、冷却期内不重复落库、开关关掉就不扫。
 */
import { BehaviorBaselineService } from './behavior-baseline.service';

/** 链式 QueryBuilder 替身：任意链式方法都返回自身，getRawMany 给出给定行。 */
function queryBuilder(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {};
  for (const m of ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'having']) {
    chain[m] = jest.fn(() => chain);
  }
  chain.getRawMany = jest.fn().mockResolvedValue(rows);
  return chain;
}

describe('BehaviorBaselineService（BA 规则型基线）', () => {
  let logRepo: { createQueryBuilder: jest.Mock; find: jest.Mock };
  let effectsRepo: { createQueryBuilder: jest.Mock };
  let alertRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; find: jest.Mock; update: jest.Mock };
  let settings: { getWithDefault: jest.Mock };
  let tools: { riskLevel: jest.Mock };
  let service: BehaviorBaselineService;

  const DEFAULTS: Record<string, unknown> = {
    ai_behavior_scan_enabled: true,
    ai_behavior_window_minutes: 10,
    ai_behavior_max_tools_per_conversation: 20,
    ai_behavior_max_failed_highrisk: 3,
    ai_behavior_max_side_effects: 30,
    ai_behavior_cooldown_minutes: 60,
  };

  beforeEach(() => {
    logRepo = { createQueryBuilder: jest.fn(() => queryBuilder([])), find: jest.fn().mockResolvedValue([]) };
    effectsRepo = { createQueryBuilder: jest.fn(() => queryBuilder([])) };
    alertRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x: unknown) => x),
      save: jest.fn((x: unknown) => Promise.resolve(x)),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    settings = {
      getWithDefault: jest.fn((key: string, fallback: unknown) => Promise.resolve(DEFAULTS[key] ?? fallback)),
    };
    tools = { riskLevel: jest.fn().mockReturnValue('R1') };
    service = new BehaviorBaselineService(
      logRepo as never,
      effectsRepo as never,
      alertRepo as never,
      settings as never,
      tools as never,
    );
  });

  describe('R-1 单会话工具调用密集', () => {
    it('阈值以「严格大于」下推给 DB —— 恰好等于的行根本不会被查出（边界）', async () => {
      const qb = queryBuilder([]);
      logRepo.createQueryBuilder.mockReturnValue(qb);

      const saved = await service.scan();

      expect(saved).toHaveLength(0);
      // 边界在这里：`>` 而不是 `>=`，且阈值取自配置（20）
      expect(qb.having).toHaveBeenCalledWith('COUNT(*) > :threshold', { threshold: 20 });
    });

    it('超一个 → 告警，且带可复算的 evidence', async () => {
      logRepo.createQueryBuilder.mockReturnValue(queryBuilder([{ cid: 'c1', cnt: '21', sampleId: '7' }]));

      const saved = await service.scan();

      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ rule: 'R-1', subjectKind: 'conversation', subjectId: 'c1', level: 'warning' });
      const evidence = JSON.parse((saved[0] as unknown as { evidenceJson: string }).evidenceJson);
      expect(evidence).toMatchObject({ count: 21, threshold: 20, windowMinutes: 10, sampleRowIds: [7] });
    });

    it('达到 2× 阈值 → critical（级别由超出倍数决定）', async () => {
      logRepo.createQueryBuilder.mockReturnValue(queryBuilder([{ cid: 'c1', cnt: '40', sampleId: '1' }]));
      const saved = await service.scan();
      expect(saved[0].level).toBe('critical');
    });
  });

  describe('R-2 高危工具被拒后反复尝试', () => {
    const failures = (n: number, detail = 'delete_customer({"id":1})') =>
      logRepo.find.mockResolvedValue(
        Array.from({ length: n }, (_, i) => ({ id: i + 1, userId: 'u1', detail, conversationId: 'c1' })),
      );

    it('高危工具失败数超阈值 → 告警（阈值 3，4 次命中）', async () => {
      tools.riskLevel.mockReturnValue('R5');
      failures(4);

      const saved = await service.scan();

      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ rule: 'R-2', subjectKind: 'user', subjectId: 'u1', level: 'warning' });
      const evidence = JSON.parse((saved[0] as unknown as { evidenceJson: string }).evidenceJson);
      expect(evidence).toMatchObject({ count: 4, threshold: 3, toolName: 'delete_customer' });
    });

    it('恰好等于阈值 → 不告警（边界）', async () => {
      tools.riskLevel.mockReturnValue('R5');
      failures(3);
      expect(await service.scan()).toHaveLength(0);
    });

    it('**低危**工具反复失败 → 不告警（不是所有失败都叫异常）', async () => {
      tools.riskLevel.mockReturnValue('R1');
      failures(10);
      expect(await service.scan()).toHaveLength(0);
    });

    it('未注册的工具（如代理工具）→ 不判高危、不误报', async () => {
      tools.riskLevel.mockImplementation(() => {
        throw new Error('Tool "proxy_x" not found');
      });
      failures(10, 'proxy_x({"a":1})');
      expect(await service.scan()).toHaveLength(0);
    });

    it('detail 形态漂移 → 静默漏检而非误报（规格 §3.2 钉住的边界）', async () => {
      tools.riskLevel.mockReturnValue('R5');
      failures(10, 'delete_customer => 执行失败'); // 不带 `(` 的形态
      expect(await service.scan()).toHaveLength(0);
    });
  });

  describe('R-3 短时写入规模异常', () => {
    it('超阈值 → 告警；阈值同样以严格大于下推', async () => {
      const qb = queryBuilder([{ cid: 'c9', cnt: '31', sampleId: '5' }]);
      effectsRepo.createQueryBuilder.mockReturnValue(qb);

      const saved = await service.scan();

      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ rule: 'R-3', subjectId: 'c9' });
      expect(qb.having).toHaveBeenCalledWith('COUNT(*) > :threshold', { threshold: 30 });
    });
  });

  describe('去重与开关', () => {
    it('冷却期内已有同 (规则 × 主体) 告警 → 不重复落库（不刷屏）', async () => {
      logRepo.createQueryBuilder.mockReturnValue(queryBuilder([{ cid: 'c1', cnt: '50', sampleId: '1' }]));
      alertRepo.findOne.mockResolvedValue({ id: 99 });

      expect(await service.scan()).toHaveLength(0);
      expect(alertRepo.save).not.toHaveBeenCalled();
    });

    it('开关关闭 → 一条规则都不跑', async () => {
      settings.getWithDefault.mockImplementation((key: string, fallback: unknown) =>
        Promise.resolve(key === 'ai_behavior_scan_enabled' ? false : fallback),
      );
      expect(await service.scan()).toHaveLength(0);
      expect(logRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('Settings 缺席时回落到规格默认阈值（窗口 10 分钟）', async () => {
      const cfg = await (service as unknown as { config: () => Promise<Record<string, number>> }).config();
      expect(cfg).toMatchObject({ windowMinutes: 10, maxToolsPerConversation: 20, maxFailedHighRisk: 3 });
    });
  });

  describe('管理面', () => {
    it('list 默认只看未处理', async () => {
      await service.list();
      expect(alertRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'open' } }));
    });

    it('list status=all 时不过滤状态', async () => {
      await service.list({ status: 'all' });
      expect(alertRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });

    it('acknowledge 只在仍 open 时改状态（幂等）', async () => {
      expect(await service.acknowledge(3)).toBe(true);
      expect(alertRepo.update).toHaveBeenCalledWith({ id: 3, status: 'open' }, expect.objectContaining({ status: 'acknowledged' }));

      alertRepo.update.mockResolvedValue({ affected: 0 });
      expect(await service.acknowledge(3)).toBe(false);
    });
  });
});
