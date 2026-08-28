/**
 * 审计哈希链并发压测（HS-11 持续压测基线工具，2026-08-25）。
 *
 * 模拟 N 并发持续审计写入 → 校验哈希链全绿（无分叉）→ 记录吞吐与 P50/P95/P99。
 * 审计链并发分叉：单实例已修复（1bf529b，AuditService 进程内串行队列）。
 * 本脚本作为「持续监控与压测」基线——每次跑验证 prevHash 连续性 + verifyChain 全绿，
 * 并给出吞吐/P95 基线；横向扩展（多实例需 DB 级串行）或性能优化前后对比用。
 *
 * 用法：
 *   npm run audit:chain:load                        # 默认 100 并发 × 10 条 = 1000 条（单实例基线）
 *   npm run audit:chain:load -- --concurrency 50 --per-worker 20
 *   npm run audit:chain:load -- --instances 2        # 多实例模式：N 个独立进程内串行队列模拟多副本
 *
 * 说明：
 *   - 内存 sqlite（:memory:）独立 DataSource，零污染、可重复。
 *   - AuditService 内部串行队列（读 lastHash → 计算 → 插入原子化）与生产一致，
 *     并发写入的真实分叉行为可被本脚本复现/拦截。
 *   - `--instances N>1`（多实例模式）：N 个 AuditService 各自独立 _tail，模拟多副本部署，
 *     复现「多实例读到同一 lastHash → 审计链分叉」——实证横向扩展需 DB 级串行（roadmap §22.10 B），
 *     DB 级串行实施后的验收标准 = `--instances 2` 分叉 0。
 *   - 每条 log 耗时含串行排队等待（反映真实用户感知 P95，而非纯写延迟）。
 *   - 绝对数值为机器基线参考（内存 sqlite 不落盘，吞吐偏高），关注相对趋势。
 */
import { DataSource } from 'typeorm';
import { performance } from 'perf_hooks';
import { ConfigService } from '@nestjs/config';
import { AiAuditLog } from '../src/ai/audit/ai-audit-log.entity';
import { AiDailyUsage } from '../src/ai/audit/ai-daily-usage.entity';
import { AiToolSideEffect } from '../src/ai/tool-effects/ai-tool-side-effect.entity';
import { AuditChainService } from '../src/common/audit-chain/audit-chain.service';
import { AuditChainLock } from '../src/common/audit-chain/audit-chain-lock.entity';
import { AuditService } from '../src/ai/audit/audit.service';

function argInt(name: string, def: number): number {
  const idx = process.argv.indexOf(`--${name}`);
  const raw = idx >= 0 ? process.argv[idx + 1] : undefined;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
}

async function main(): Promise<void> {
  const concurrency = argInt('concurrency', 100);
  const perWorker = argInt('per-worker', 10);
  const instances = argInt('instances', 1);
  const total = concurrency * perWorker;

  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AiAuditLog, AiDailyUsage, AiToolSideEffect, AuditChainLock],
    synchronize: true,
  });
  await ds.initialize();
  // 锁行 seed（生产由迁移 INSERT；脚本用 synchronize 需手动）
  await ds.getRepository(AuditChainLock).insert({ id: 1, holder: 'seed' });

  const auditChain = new AuditChainService(new ConfigService());
  // 多实例模式（--instances N>1）：N 个 AuditService 实例各自独立的进程内串行队列（_tail），
  // 模拟多副本部署——复现「多实例读到同一 lastHash → 审计链分叉」，实证需要 DB 级串行（roadmap §22.10 B）。
  const services = Array.from({ length: instances }, () =>
    new AuditService(
      ds.getRepository(AiAuditLog),
      ds.getRepository(AiDailyUsage),
      ds.getRepository(AiToolSideEffect),
      auditChain,
      ds, // DataSource：DB 级串行锁（roadmap §22.10 B）
    ),
  );

  const durations: number[] = [];
  const started = performance.now();

  await Promise.all(
    Array.from({ length: concurrency }, (_, w) => (async () => {
      const service = services[w % instances];
      for (let i = 0; i < perWorker; i++) {
        const t0 = performance.now();
        await service.log({
          userId: 'load-test',
          action: 'tool_call',
          detail: 'audit-chain-load-test',
          model: 'load-test',
          provider: 'load-test',
          promptTokens: 1,
          completionTokens: 1,
          durationMs: 1,
        });
        durations.push(performance.now() - t0);
      }
    })()),
  );

  const wallMs = performance.now() - started;

  // 分叉检测：prevHash 连续性 + verifyChain 全绿
  const rows = await ds.getRepository(AiAuditLog).find({ order: { id: 'ASC' } });
  let forked = 0;
  for (let i = 0; i < rows.length; i++) {
    const expect = i === 0 ? null : rows[i - 1].hash;
    if (rows[i].prevHash !== expect) forked++;
  }
  const chain = await services[0].verifyChain();

  const sorted = [...durations].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

  console.log('\n=== Audit Chain 并发压测基线 ===');
  console.log(`并发 worker : ${concurrency}`);
  console.log(`服务实例   : ${instances}`);
  console.log(`总写入条数 : ${total}（${perWorker}/worker）`);
  console.log(`实际落库   : ${rows.length}`);
  console.log(`分叉条数   : ${forked}${forked === 0 ? ' ✅' : ' ❌'}`);
  console.log(`verifyChain : ${chain.valid ? 'valid ✅' : `INVALID ❌ brokenIndex=${chain.brokenIndex}`}（checked=${chain.checked}）`);
  console.log(`总耗时     : ${wallMs.toFixed(1)} ms`);
  console.log(`吞吐       : ${(total / (wallMs / 1000)).toFixed(1)} ops/s`);
  console.log(`延迟(含排队): min ${pct(0).toFixed(2)} | p50 ${pct(50).toFixed(2)} | p95 ${pct(95).toFixed(2)} | p99 ${pct(99).toFixed(2)} | max ${pct(100).toFixed(2)} ms`);
  console.log('=================================');

  await ds.destroy();

  if (instances === 1) {
    // 单实例：分叉 = 真实故障
    if (forked > 0 || !chain.valid) {
      process.exitCode = 1;
      console.error('单实例审计链分叉！请检查 AuditService 串行队列。');
    }
  } else if (forked === 0) {
    // 多实例但未分叉（极端时序）：属幸运，但仍证明无跨实例串行保障
    console.warn('多实例未观察到分叉（时序巧合）——但进程内串行队列不提供跨实例保证，仍需 DB 级串行。');
  } else {
    // 多实例分叉 = 预期复现（roadmap §22.10 B 的实证）：横向扩展前需 DB 级串行
    console.error(`\n✅ 多实例分叉复现（${forked} 条）——实证：进程内串行队列在 ${instances} 副本下不提供链一致性。`);
    console.error('   横向扩展前必须升级为 DB 级串行（行锁/单写者），见 roadmap §22.10「多副本决策」B 方案。');
  }
}

main().catch((err) => {
  console.error('压测失败:', err);
  process.exitCode = 1;
});
