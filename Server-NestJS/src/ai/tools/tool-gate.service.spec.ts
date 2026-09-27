// SPDX-License-Identifier: Apache-2.0

import { ToolGateService } from './tool-gate.service';
import { ToolRegistry } from './tool-registry';
import { ExternalToolRegistry } from './external-tool-registry';
import { fixtureUserId, isFixtureUser } from '../constants/fixture-identity';
import { MetricsService } from '../../metrics/metrics.service';

/**
 * REV-15：闸门拒绝要留下**「门在守」的证据**。
 *
 * 此前拒绝是抛异常，抛完就散——生产上没人能回答「这个闸门到底拒绝过真实调用吗」。现在同一闸门、
 * 同一计数器（`tool_gate_refusals_total`），按检查项与身份来源分标签；三种读法写在
 * `MetricsService.toolGateRefusalsTotal` 的文档注释上（计数器在，读法在）。
 *
 * 本组用例钉三件事：① 拒绝确实计数且 `reason` 正确；② 夹具身份记 `fixture`、真实用户记 `production`；
 * ③ 两条身份走**同一个计数器**（不是各记各的），且**放行不计**。
 */

function makeMetrics(): { toolGateRefusalsTotal: { inc: jest.Mock } } {
  return { toolGateRefusalsTotal: { inc: jest.fn() } };
}

function makeRegistry(riskLevel = 'R1'): ToolRegistry {
  return {
    getTool: jest.fn(() => ({ name: 'x' })),
    riskLevel: jest.fn(() => riskLevel),
  } as unknown as ToolRegistry;
}

const NO_EXTERNAL = { isExternal: jest.fn(() => false) } as unknown as ExternalToolRegistry;

function makeGate(
  opts: { riskLevel?: string; policy?: unknown; metrics?: boolean } = {},
): { gate: ToolGateService; metrics: ReturnType<typeof makeMetrics> } {
  const metrics = makeMetrics();
  const registry = makeRegistry(opts.riskLevel);
  const gate = new ToolGateService(
    registry,
    NO_EXTERNAL,
    opts.policy as never,
    undefined,
    undefined,
    (opts.metrics === false ? undefined : metrics) as unknown as MetricsService,
  );
  return { gate, metrics };
}

describe('REV-15 闸门拒绝计数', () => {
  it('R5 阻断：记一次 reason=risk_policy，真实用户身份记 source=production', async () => {
    const { gate, metrics } = makeGate({ riskLevel: 'R5' });

    await expect(gate.assertToolAllowed('delete_customer', '7')).rejects.toThrow(/R5/);

    expect(metrics.toolGateRefusalsTotal.inc).toHaveBeenCalledWith({
      reason: 'risk_policy',
      source: 'production',
    });
  });

  it('夹具身份（评测 run）记 source=fixture —— **与生产同一个计数器**', async () => {
    const { gate, metrics } = makeGate({ riskLevel: 'R5' });

    await expect(gate.assertToolAllowed('delete_customer', fixtureUserId(1758880000000))).rejects.toThrow(
      /R5/,
    );

    expect(metrics.toolGateRefusalsTotal.inc).toHaveBeenCalledWith({
      reason: 'risk_policy',
      source: 'fixture',
    });
  });

  it('治理策略禁用：reason=tool_enabled', async () => {
    const policy = {
      isToolEnabled: jest.fn().mockResolvedValue(false),
      getAllowedRoles: jest.fn().mockResolvedValue([]),
    };
    const { gate, metrics } = makeGate({ policy });

    await expect(gate.assertToolAllowed('create_event', '7')).rejects.toThrow(
      /disabled by governance policy/,
    );

    expect(metrics.toolGateRefusalsTotal.inc).toHaveBeenCalledWith({
      reason: 'tool_enabled',
      source: 'production',
    });
  });

  it('声明域越界（destination 白名单）同样计数 —— 该路径也走同一个出口', async () => {
    const policy = {
      getToolPolicy: jest.fn().mockResolvedValue({ allowedDestinations: ['legacy-erp'], writableFields: [] }),
    };
    const { gate, metrics } = makeGate({ policy });

    // 该工具无 audience → 目的地为 'local'，不在白名单里 → 拒
    await expect(gate.assertWithinDeclaredScope('proxy_send', {}, '7')).rejects.toThrow(
      /not allowed to write to destination/,
    );

    expect(metrics.toolGateRefusalsTotal.inc).toHaveBeenCalledWith({
      reason: 'destination_allowed',
      source: 'production',
    });
  });

  it('放行不计：这个计数器数的是「拒绝」，不是「调用」', async () => {
    const { gate, metrics } = makeGate({ riskLevel: 'R1' });

    await gate.assertToolAllowed('create_event', '7');

    expect(metrics.toolGateRefusalsTotal.inc).not.toHaveBeenCalled();
  });

  it('缺 MetricsService 时计数静默跳过，但**拒绝照旧**（计数是证据，不是门控本身）', async () => {
    const { gate } = makeGate({ riskLevel: 'R5', metrics: false });

    await expect(gate.assertToolAllowed('delete_customer', '7')).rejects.toThrow(/R5/);
  });

  it('夹具身份单源：评测构造出的 userId 一定判读为夹具（构造与判读不会漂移）', () => {
    expect(isFixtureUser(fixtureUserId(1758880000000))).toBe(true);
    // 真实用户 id 与系统账号都不是夹具
    expect(isFixtureUser('7')).toBe(false);
    expect(isFixtureUser('0')).toBe(false);
  });
});

describe('REV-15 接真计数器：证据出现在暴露面上，而不是「名字存在」', () => {
  it('拒绝之前只有 HELP/TYPE、没有 series；拒绝之后出现那一行', async () => {
    // 真 MetricsService（prom-client 全局 registry）——证明 计数器 → 暴露面 这一段接通
    const metrics = new MetricsService();
    const gate = new ToolGateService(
      makeRegistry('R5'),
      NO_EXTERNAL,
      undefined,
      undefined,
      undefined,
      metrics,
    );

    const before = await metrics.getMetrics();
    // ⚠ 名字在，但**没有 series**：零样本的计数器只暴露 HELP/TYPE（实测）。
    // 只看名字的话，「从未拒绝过」与「守得很好」读数完全相同——那正是本项要消除的东西。
    expect(before).toContain('tool_gate_refusals_total');
    expect(before).not.toMatch(/^tool_gate_refusals_total\{/m);

    await expect(gate.assertToolAllowed('delete_customer', '7')).rejects.toThrow(/R5/);

    const after = await metrics.getMetrics();
    expect(after).toMatch(/^tool_gate_refusals_total\{reason="risk_policy",source="production"\} 1$/m);
  });
});
