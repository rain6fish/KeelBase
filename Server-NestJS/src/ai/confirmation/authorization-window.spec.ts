// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiConfirmationRequest } from '../approvals/ai-confirmation-request.entity';
import { AiToolSideEffect } from '../tool-effects/ai-tool-side-effect.entity';
import { AiToolEffectsService } from '../tool-effects/ai-tool-effects.service';
import { ConfirmationStore } from './confirmation.store';

/**
 * REV-7: an authorization's window and its agent must be answerable **from the record**.
 *
 * Both facts already existed and neither could be read back from the thing it belongs to:
 *
 * 1. The window was computed on read as `createdAt + the current offline TTL` — a **mutable setting**.
 *    So an operator changing the setting **retroactively moved the window of every row already on the
 *    books**, and "was this still inside its window at the time" had no answer that stayed put.
 * 2. The agent lived on the audit row, one structure away with no direct key — the pairing had to be
 *    approximated by conversation / run / tool.
 *
 * Old implementation cannot produce these observations: there is no `expires_at` and no `agent_id`
 * column at all, so every assertion here is red against it. Real sqlite, because both are persisted
 * facts and a mock would wave through whether the columns were written.
 */
const OFFLINE_TTL_KEY = 'confirmation_offline_ttl_seconds';

/** Settings 替身：离线 TTL 可改，用来证明「改配置不再挪动已记录的窗口」。 */
function makeSettings(initialSeconds: number) {
  const state = { seconds: initialSeconds };
  return {
    state,
    getWithDefault: jest.fn(async (key: string, fallback: unknown) =>
      key === OFFLINE_TTL_KEY ? state.seconds : fallback,
    ),
  };
}

describe('REV-7 授权窗口与 agent 身份可从记录回答', () => {
  let ds: DataSource;

  const confirmations = () => ds.getRepository(AiConfirmationRequest);
  const effects = () => ds.getRepository(AiToolSideEffect);

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiConfirmationRequest, AiToolSideEffect],
      synchronize: true,
    });
    await ds.initialize();
  });

  afterEach(async () => {
    await ds.destroy();
  });

  describe('① 授权窗口在建行时落定', () => {
    it('建行即记下窗口（建行时的离线 TTL），不再由读时按当前配置推算', async () => {
      const settings = makeSettings(3600); // 1 小时
      const store = new ConfirmationStore(confirmations(), undefined, settings as never);

      const before = Date.now();
      await store.create('u-1', 'create_event', { title: 'X' });

      const row = await confirmations().findOneByOrFail({ operatorId: 'u-1' });
      expect(row.expiresAt).not.toBeNull();
      // 窗口 = 建行时刻 + 建行时的 TTL（旧实现连这一列都没有）
      const delta = row.expiresAt!.getTime() - before;
      expect(delta).toBeGreaterThan(3600_000 - 10_000);
      expect(delta).toBeLessThan(3600_000 + 10_000);
    });

    it('**改配置不挪动已记录的窗口**（旧实现读时按当前配置重算，会跟着变）', async () => {
      const settings = makeSettings(3600);
      const store = new ConfirmationStore(confirmations(), undefined, settings as never);
      await store.create('u-1', 'create_event', { title: 'X' });
      const recorded = (await confirmations().findOneByOrFail({ operatorId: 'u-1' })).expiresAt;

      // 运维把离线窗口从 1 小时改成 48 小时
      settings.state.seconds = 48 * 3600;
      await store.create('u-2', 'create_event', { title: 'Y' });

      const first = await confirmations().findOneByOrFail({ operatorId: 'u-1' });
      const second = await confirmations().findOneByOrFail({ operatorId: 'u-2' });

      // 已记录的那一行**纹丝不动** —— 窗口是那次授权的事实，不是今天配置的函数
      expect(first.expiresAt!.getTime()).toBe(recorded!.getTime());
      // 而新行按新配置落定，两者相差 47 小时左右
      const gap = second.expiresAt!.getTime() - first.expiresAt!.getTime();
      expect(gap).toBeGreaterThan(47 * 3600_000 - 10_000);
    });
  });

  describe('② agent 身份随副作用行留存', () => {
    it('写时记下 agent；管理端列表**不 join 审计行**即可读出', async () => {
      const svc = new AiToolEffectsService(effects());
      await svc.record(
        {
          userId: 'u-1',
          conversationId: 'conv-1',
          toolName: 'create_event',
          args: { title: 'X' },
          agentId: 'agent-sub-7',
        },
        'event',
        42,
        { before: null, after: '{"title":"X"}' },
      );

      const row = await effects().findOneByOrFail({ resultId: 42 });
      expect(row.agentId).toBe('agent-sub-7');

      const item = (await svc.list({})).items[0] as unknown as Record<string, unknown>;
      expect(item.agentId).toBe('agent-sub-7');
      // 同一条读数里也还答得出「替哪个用户」——两问都由副作用行自己回答
      expect(item.ownerUserId).toBe('u-1');
    });

    it('没有 agent 参与（用户本人直接操作）→ null，不编一个身份', async () => {
      const svc = new AiToolEffectsService(effects());
      await svc.record(
        { userId: 'u-1', conversationId: 'conv-2', toolName: 'create_event', args: { title: 'Y' } },
        'event',
        43,
        { before: null, after: '{"title":"Y"}' },
      );

      const row = await effects().findOneByOrFail({ resultId: 43 });
      expect(row.agentId).toBeNull();
    });
  });
});
