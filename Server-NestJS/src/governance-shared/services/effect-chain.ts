// SPDX-License-Identifier: Apache-2.0

import { DataSource, EntityManager, Repository } from 'typeorm';
import { AiToolSideEffect } from '../../governance-shared/entities/ai-tool-side-effect.entity';
import type { AuditChainService } from '../../common/audit-chain/audit-chain.service';

/**
 * G-3 副作用链 canonical payload（稳定字段；AuditChainService canonical 排序键 → 写入/校验一致）。
 *
 * **放在模块级而不是类里**：它是「链上到底有哪些列」这个**契约**，与任何实例无关，而门禁要能直接钉住它
 * —— 「新增的链外注解列不得进白名单」这类断言此前只能靠 `as any` 伸手去够实例的私有方法。
 *
 * Module-level rather than a method: this is the contract of which columns are on the chain, it needs no
 * instance, and a gate should be able to pin it directly instead of reaching into a private member.
 */
export function chainPayload(row: Record<string, unknown>): Record<string, unknown> {
  return {
    idempotencyKey: row.idempotencyKey ?? null,
    userId: row.userId ?? null,
    conversationId: row.conversationId ?? null,
    toolName: row.toolName ?? null,
    argsHash: row.argsHash ?? null,
    resultType: row.resultType ?? null,
    resultId: row.resultId ?? null,
    beforeSnapshot: row.beforeSnapshot ?? null,
    afterSnapshot: row.afterSnapshot ?? null,
  };
}

/**
 * G-3 副作用哈希链的写入口与校验。**从 `ai-tool-effects.service.ts` 整段搬出**（2026-10-11 拆分第三批），
 * 只把 `this.effectsRepo` / `this.auditChain` / `this.dataSource` 换成本类自己的字段，实现一字未改。
 *
 * ⚠ **只能有一份实例**：下面那个 `_chainTail` 是**进程内串行队列**，登记与撤销必须共用同一个 writer ——
 * 两个 writer 就是两条队列，单写者（sqlite）那条路上链会丢更新。
 *
 * The hash-chain write path and its verification, moved out of the service as one piece. Exactly one
 * instance may exist: the in-process serialization queue below must be shared by registration and
 * revocation, or the single-writer path ends up with two queues and loses updates.
 */
export class EffectChainWriter {
  /** G-3 链写入串行队列（sqlite 等单写者；postgres 走 DB 锁，不依赖此队列） */
  private _chainTail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly effectsRepo: Repository<AiToolSideEffect>,
    private readonly auditChain?: AuditChainService,
    private readonly dataSource?: DataSource,
  ) {}

  /**
   * 链写上下文：把一段「读 prev → 算 hash → 插入」的 read-modify-write **串行化**，否则并发写读同一 prev
   * → 链分叉（verifySideEffectChain 判 invalid）。单行登记与复合组登记共用本上下文：
   * - **postgres**：事务内锁 `audit_chain_lock` 行（id=2；与主审计链 id=1 分开，避免两链互相串行）→ 执行 fn →
   *   提交。fn 内的插入必须走 `runner.manager` 且在锁内提交——否则锁释放早于插入落库，后到者仍读到旧 prev。
   *   传同一个 manager 还能让组内后续成员读到**本事务内**前序成员（组内链相邻 + 登记原子）。
   * - **单写者（sqlite/better-sqlite3）**：进程内 promise 串行 **+ 真事务包裹整段**（跨进程仍为 best-effort，
   *   与主链 sqlite 分支同）。事务是「整组一次登记」的兑现——原先只串行不包裹，组内中途失败会留下**半组**
   *   （前几条已提交、后几条没有），而 `recordGroup` 的契约恰恰承诺「杜绝半组」；dev/test 默认走的就是这条路径。
   */
  async withChainWrite<T>(fn: (manager?: EntityManager) => Promise<T>): Promise<T> {
    if (this.dataSource?.options.type === 'postgres') {
      const runner = this.dataSource.createQueryRunner();
      await runner.connect();
      try {
        await runner.startTransaction();
        await runner.query(
          `INSERT INTO "audit_chain_lock" (id, holder) VALUES (2, 'side-effect') ON CONFLICT (id) DO NOTHING`,
        );
        await runner.query('SELECT id FROM "audit_chain_lock" WHERE id = 2 FOR UPDATE');
        const out = await fn(runner.manager);
        await runner.commitTransaction();
        return out;
      } catch (err) {
        await runner.rollbackTransaction().catch(() => {});
        throw err;
      } finally {
        await runner.release();
      }
    }
    // Serialise in-process **and** wrap the whole stretch in a real transaction, so a group is
    // all-or-nothing. Without the transaction a mid-group failure left the earlier members
    // committed — the half-group that `recordGroup` promises never to produce.
    // 进程内串行 **+ 真事务**包裹整段，使整组要么全登记、要么全不登记；没有事务时组内中途失败
    // 会留下半组（前几条已提交），与 `recordGroup` 的契约相反。
    const run = () => (this.dataSource ? this.dataSource.transaction((m) => fn(m)) : fn());
    const job = this._chainTail.then(run);
    this._chainTail = job.catch(() => {});
    return job;
  }

  /** 链内插入一行（须在 `withChainWrite` 提供的上下文内调用，prev 才读到同事务/同批次的前序行） */
  async insertOne(base: Record<string, unknown>, manager?: EntityManager): Promise<AiToolSideEffect> {
    let chain: { prevHash: string | null; hash: string } | undefined;
    if (this.auditChain) {
      const prev = await this.lastSideEffectHash(manager);
      chain = { prevHash: prev ?? null, hash: this.auditChain.computeHash(prev, chainPayload(base)) };
    }
    const repo = manager ? manager.getRepository(AiToolSideEffect) : this.effectsRepo;
    return repo.save(repo.create({ ...base, ...(chain ?? {}) } as Partial<AiToolSideEffect>));
  }

  /** G-3：最近一条已哈希副作用行的 hash（接链用；无 → null genesis） */
  private async lastSideEffectHash(manager?: EntityManager): Promise<string | null> {
    const row = await (manager ? manager.getRepository(AiToolSideEffect) : this.effectsRepo)
      .createQueryBuilder('e')
      .select('e.hash', 'hash')
      .where('e.hash IS NOT NULL')
      .orderBy('e.id', 'DESC')
      .limit(1)
      .getRawOne<{ hash: string }>();
    return row?.hash ?? null;
  }

  /** G-3：副作用哈希链完整性校验（仅校验已哈希行；历史 null 行不在链内） */
  async verify(): Promise<{ valid: boolean; checked: number; hashed: number; firstHashedId: number | null }> {
    if (!this.auditChain) return { valid: true, checked: 0, hashed: 0, firstHashedId: null };
    const rows = await this.effectsRepo.find({ order: { id: 'ASC' } });
    const hashed = rows.filter((r) => r.hash);
    const res = this.auditChain.verifyChain(
      hashed,
      (row) => chainPayload(row as unknown as Record<string, unknown>),
    );
    return { valid: res.valid, checked: res.checked, hashed: hashed.length, firstHashedId: hashed[0]?.id ?? null };
  }
}
