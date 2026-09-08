// SPDX-License-Identifier: Apache-2.0

import { AiToolEffectsService } from './ai-tool-effects.service';

function makeEffect(over: Partial<Record<string, unknown>>) {
  return {
    id: 1,
    idempotencyKey: `k${over.id ?? 1}`,
    userId: 'u1',
    conversationId: 'conv-1',
    toolName: 'create_event',
    argsHash: 'h',
    resultType: 'event',
    resultId: 1,
    revokeClass: 'local_compensate',
    revokeStatus: null,
    ...over,
  } as any;
}

function makeRepo(effects: unknown[]) {
  return {
    find: jest.fn().mockResolvedValue(effects),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  };
}

function makeRevoker() {
  return {
    canHandle: jest.fn().mockReturnValue(true),
    revoke: jest.fn().mockResolvedValue({ revoked: true }),
    describeTarget: jest.fn().mockResolvedValue(null),
  };
}

function makeExternalRevoker() {
  return { revoke: jest.fn().mockResolvedValue({ ok: true, message: 'compensated' }) };
}

describe('AiToolEffectsService.revokeConversation（G1 会话级批量撤销）', () => {
  it('owner 过滤：只撤销本人 effect，他人效果不处理', async () => {
    const effects = [
      makeEffect({ id: 1, userId: 'u1', revokeStatus: 'revoked' }),
      makeEffect({ id: 2, userId: 'u2', revokeClass: 'local_compensate' }),
    ];
    const repo = makeRepo(effects);
    const revoker = makeRevoker();
    const svc = new AiToolEffectsService(repo as any, revoker as any);

    const r = await svc.revokeConversation('conv-1', { ownerId: 'u1' });

    expect(r.total).toBe(1); // 只 u1 那条
    expect(revoker.revoke).not.toHaveBeenCalled(); // u1 那条已 revoked → skip
    expect(r.skipped).toBe(1);
    expect(r.results[0].reason).toBe('already_revoked');
  });

  it('已撤销/补偿中跳过一次，不重复触发', async () => {
    const effects = [
      makeEffect({ id: 1, revokeStatus: 'revoked' }),
      makeEffect({ id: 2, revokeStatus: 'compensating' }),
    ];
    const repo = makeRepo(effects);
    const revoker = makeRevoker();
    const svc = new AiToolEffectsService(repo as any, revoker as any);

    const r = await svc.revokeConversation('conv-1');

    expect(r.skipped).toBe(2);
    expect(r.revoked).toBe(0);
    expect(revoker.revoke).not.toHaveBeenCalled();
  });

  it('本地可撤（local_compensate）→ 逐条软删 + 回写 revoked', async () => {
    const effect = makeEffect({ id: 5, resultType: 'event', resultId: 7 });
    const repo = makeRepo([effect]);
    const revoker = makeRevoker();
    const svc = new AiToolEffectsService(repo as any, revoker as any);

    const r = await svc.revokeConversation('conv-1');

    expect(revoker.canHandle).toHaveBeenCalledWith('event');
    expect(revoker.revoke).toHaveBeenCalledWith('event', 7, 'u1');
    expect(repo.update).toHaveBeenCalledWith(5, { revokeStatus: 'revoked' });
    expect(r.revoked).toBe(1);
    expect(r.results[0].revokeStatus).toBe('revoked');
  });

  it('revokeClass=none → 明确拒绝（不撤，计入 failed/revoked=false），不碰 revoker', async () => {
    const effect = makeEffect({ id: 9, resultType: 'proxy_call', revokeClass: 'none' });
    const repo = makeRepo([effect]);
    const revoker = makeRevoker();
    const ext = makeExternalRevoker();
    const svc = new AiToolEffectsService(repo as any, revoker as any, ext as any);

    const r = await svc.revokeConversation('conv-1');

    expect(revoker.revoke).not.toHaveBeenCalled();
    expect(ext.revoke).not.toHaveBeenCalled();
    expect(r.failed).toBe(1);
    expect(r.results[0].revoked).toBe(false);
    expect(r.results[0].message).toContain('无撤销接口');
  });

  it('governed_external → 走外部补偿，2xx 落 compensating（诚实：结果在目标系统）', async () => {
    const effect = makeEffect({
      id: 11,
      toolName: 'proxy_send',
      resultType: 'proxy_call',
      revokeClass: 'governed_external',
    });
    const repo = makeRepo([effect]);
    const ext = makeExternalRevoker();
    const svc = new AiToolEffectsService(repo as any, undefined, ext as any);

    const r = await svc.revokeConversation('conv-1');

    expect(ext.revoke).toHaveBeenCalledWith('proxy_send', 1, 'u1');
    expect(repo.update).toHaveBeenCalledWith(11, { revokeStatus: 'compensating' });
    expect(r.revoked).toBe(1);
    expect(r.results[0].revokeStatus).toBe('compensating');
    expect(r.results[0].external).toBe(true);
  });

  it('revoke_failed 视为可重试（不跳过）', async () => {
    const effect = makeEffect({ id: 13, revokeStatus: 'revoke_failed' });
    const repo = makeRepo([effect]);
    const revoker = makeRevoker();
    const svc = new AiToolEffectsService(repo as any, revoker as any);

    const r = await svc.revokeConversation('conv-1');

    expect(revoker.revoke).toHaveBeenCalled();
    expect(r.skipped).toBe(0);
    expect(r.revoked).toBe(1);
  });

  it('逐条执行抛错 → 计入 failed 且不中断其它', async () => {
    const effects = [makeEffect({ id: 21 }), makeEffect({ id: 22 })];
    const repo = makeRepo(effects);
    const revoker = makeRevoker();
    revoker.revoke.mockRejectedValueOnce(new Error('boom'));
    const svc = new AiToolEffectsService(repo as any, revoker as any);

    const r = await svc.revokeConversation('conv-1');

    expect(r.total).toBe(2);
    expect(r.revoked).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.results[0].error).toBe('boom');
  });
});
