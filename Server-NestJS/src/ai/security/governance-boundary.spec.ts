// SPDX-License-Identifier: Apache-2.0

/**
 * ③ — the governance boundary must hold for **whatever the model emits**.
 *
 * A model's output is not deterministic, so "the boundary holds" cannot be tested by asking a model to
 * behave. It is tested by driving the real gate and registry with adversary-chosen input, the same way an
 * attacker (or a hallucinating model) would: a tool name that does not exist, a read of someone else's row,
 * a write nobody approved. The invariant is *the outcome*, never the reply text.
 *
 * Two of the four outcomes are already proven deterministically in `security-showcase.service.spec.ts`
 * (越权 → denied, R5 → blocked, 写 → requiresConfirmation). What that suite cannot express lives here:
 * **a hallucinated tool name**, and the **positive control** without which "deny everything" would pass
 * every denial case in the repo.
 *
 * ③ —— 治理边界必须对**模型输出的任何值**成立。
 *
 * 模型输出不确定，所以「边界成立」不能靠要求模型守规矩来测。测法是：像攻击者（或一个幻觉中的模型）
 * 那样，用**对抗方选定**的输入驱动真实的门与注册表——不存在的工具名、他人的行、没人批过的写。
 * 判据只认 **outcome**，从不认回复文本。
 *
 * 四类 outcome 里的两类已在 `security-showcase.service.spec.ts` 里确定性证明（越权 → denied、
 * R5 → blocked、写 → requiresConfirmation）。那套用例表达不了的两条在这里：**幻觉出的工具名**，
 * 以及**正向对照** —— 没有它，「一律拒绝」能通过本仓所有否定面用例。
 */
import { subject } from '@casl/ability';
import { CaslAbilityFactory } from '../../common/casl/casl-ability.factory';
import { UserRole } from '../../common/entities/user.entity';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolGateService } from '../tools/tool-gate.service';
import { ToolExecutionService } from '../tools/tool-execution.service';
import { ExternalToolRegistry } from '../tools/external-tool-registry';
import { QueryCustomersTool } from '../tools/query-customers.tool';

/** 一个正常的只读工具，依赖被替换成返回固定数据（本 spec 关心的是门与执行路径，不是 CRM）。 */
const readTool = new QueryCustomersTool({
  listCustomers: async () => ({ items: [{ id: 1, name: '客户', status: 'active', riskLevel: 'low' }], total: 1 }),
} as never);

function buildRuntime() {
  const registry = new ToolRegistry();
  registry.register(readTool);
  const external = new ExternalToolRegistry();
  const gate = new ToolGateService(registry, external);
  const execution = new ToolExecutionService(registry, gate, external);
  return { registry, gate, execution };
}

describe('治理边界（③：不依赖模型输出）', () => {
  it('不存在的 tool → deny：模型幻觉出的任何工具名都跑不起来', async () => {
    const { registry, execution } = buildRuntime();

    // 执行前置：注册表对未注册名**抛错**，而不是返回 undefined 让调用方继续
    expect(() => registry.getTool('hallucinated_tool_name')).toThrow(/not found/);

    // 读路径：与主循环同一条 —— 未知名字停在「未执行」，不会静默变成一次执行
    await expect(execution.executeRead('hallucinated_tool_name', {}, '5')).rejects.toThrow(/not found/);
    // 写路径同理
    await expect(
      execution.executeWrite('hallucinated_tool_name', {}, '5'),
    ).rejects.toThrow(/not found/);
  });

  it('越权 → deny：非属主读他人行，CASL 直接拒（不进入工具调用）', () => {
    const factory = new CaslAbilityFactory();
    const bob = factory.createForUser({ sub: 999999, role: UserRole.USER, username: 'bob' });
    const alexCustomer = { id: 1, userId: 1 };

    expect(bob.cannot('read', subject('CrmCustomer', alexCustomer))).toBe(true);
  });

  it('正常请求 → execute（正向对照）：放行面真的放行，不是「一律拒绝」', async () => {
    const { gate, execution } = buildRuntime();

    // 门放行（读工具、无需确认），且执行真的返回了数据
    await expect(gate.assertToolAllowed('query_customers', '5')).resolves.toBeUndefined();
    await expect(gate.requiresConfirmation('query_customers')).resolves.toBe(false);

    const result = await execution.executeRead('query_customers', {}, '5');
    expect(result.success).toBe(true);
    expect((result.data as { total: number }).total).toBe(1);
  });

  it('属主读自己的行 → 允许（正向对照的另一半：拒的是「越权」，不是「读」）', () => {
    const factory = new CaslAbilityFactory();
    const alex = factory.createForUser({ sub: 1, role: UserRole.USER, username: 'alex' });

    expect(alex.can('read', subject('CrmCustomer', { id: 1, userId: 1 }))).toBe(true);
  });
});
