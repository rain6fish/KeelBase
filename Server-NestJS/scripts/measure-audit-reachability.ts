#!/usr/bin/env ts-node

// SPDX-License-Identifier: Apache-2.0

/**
 * AW-11 criterion #6 — the reader. Ask "which row types cannot be reached from an audit row?" and
 * get a list, over a **pinned time window and row cap**.
 *
 * The check itself (`checkAuditReachability`) already existed and was only ever called from its own
 * spec — an answer nobody could ask for. This script is the caller, deliberately a read-only command
 * rather than an endpoint: an endpoint would need a permission surface, a DTO and a console page, and
 * the question has no such audience yet.
 *
 * **The caveat is printed before the numbers, on purpose.** `ai_audit_logs.write_claim_id` was added
 * without a backfill, so on any database that predates the column every historical row is `NULL` and
 * reports `claim(no_write_claim_id)`, taking `effect` and `confirmation` with it as
 * `claim_unreachable`. That is the design, not a fault — but a reader who sees "3 row types
 * unreachable" first will conclude the system is broken. Coverage is therefore stated first, with the
 * caveat beside it.
 *
 * Usage:
 *     npm run measure:reachability                       # last 24h, at most 500 audit rows
 *     npm run measure:reachability -- --since 7d --limit 200
 *     npm run measure:reachability -- --since 2026-10-01T00:00:00Z --limit 1000 --json
 *
 * Exit codes — three states, so "the reading is empty" and "the instrument never ran" stay distinct:
 *
 *     0  the reading was taken (this says nothing about whether rows were reachable)
 *     1  the arguments were rejected (bad `--since`, `--limit` out of range)
 *     2  the reading could not be taken (database unreachable, query failed)
 *
 * AW-11 判据 #6 —— 它的**读者**。问「从审计行出发哪些 row type 走不到」，得到一个清单，取数范围
 * **钉住时间窗与条数上限**。
 *
 * 检查本身（`checkAuditReachability`）早就写好了，但只被它自己的 spec 调用 —— 一个没人问得出的答案。
 * 本脚本就是那个调用方：它是**只读命令**而不是端点，因为端点要权限面、DTO 与管理台页面，而这个问题
 * 目前没有那样的读者。
 *
 * **口径先于数字打印**，这是有意的。`ai_audit_logs.write_claim_id` 落地时**不回填**，所以任何早于
 * 该列的库，历史行全是 `NULL`，一律报 `claim(no_write_claim_id)`，并把 `effect` 与 `confirmation`
 * 作为 `claim_unreachable` 一起带走。那是设计，不是故障 —— 但先看到「3 类可达不了」的人会以为系统
 * 坏了。故先讲覆盖，口径与覆盖放在一起。
 *
 * 用法：
 *     npm run measure:reachability                       # 最近 24 小时、最多 500 条审计行
 *     npm run measure:reachability -- --since 7d --limit 200
 *     npm run measure:reachability -- --since 2026-10-01T00:00:00Z --limit 1000 --json
 *
 * 退出码三个状态，「读数为空」与「仪器根本没跑」必须分得开：
 *
 *     0  读数已取（这不表示行都可达）
 *     1  参数被拒（`--since` 不合法、`--limit` 越界）
 *     2  读数取不到（库连不上、查询失败）
 */

import { AppDataSource } from '../src/config/typeorm-data-source';
import { AiAuditLog } from '../src/governance-shared/entities/ai-audit-log.entity';
import { AiWriteClaim } from '../src/governance-shared/entities/ai-write-claim.entity';
import { AiToolSideEffect } from '../src/governance-shared/entities/ai-tool-side-effect.entity';
import { AiConfirmationRequest } from '../src/governance-shared/entities/ai-confirmation-request.entity';
import { checkAuditReachability } from '../src/governance-shared/services/audit-reachability';

const DEFAULT_LIMIT = 500;
/** Above this the walk stops being "one screen of rows" and starts being a bulk job. */
const MAX_LIMIT = 5000;
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

const CAVEAT =
  'No backfill: rows written before ai_audit_logs.write_claim_id existed carry no forward edge, so ' +
  'they always report claim(no_write_claim_id) — and effect/confirmation follow as claim_unreachable. ' +
  'That is the design, not a fault. Read the window and the cap below before the numbers. / ' +
  '不回填：早于 write_claim_id 的历史行没有正向边，一律报 claim(no_write_claim_id)，' +
  'effect 与 confirmation 随之报 claim_unreachable。这是设计，不是故障。先看下面的窗口与上限，再看数字。';

const USAGE = `用法：npm run measure:reachability -- [--since <ISO|7d|12h|30m>] [--limit <1..${MAX_LIMIT}>] [--json]

  --since   时间窗（默认 24h）。接受 ISO 8601，或 <数字><d|h|m> 形式的相对窗口。
  --limit   最多走查多少条审计行（默认 ${DEFAULT_LIMIT}，上限 ${MAX_LIMIT}）；超出的如实标 truncated。
  --json    只打一行机读 JSON（口径作为 caveat 字段一并带上）。

退出码：0 = 读数已取；1 = 参数被拒；2 = 读数取不到。`;

class ArgError extends Error {}

/**
 * `7d` / `12h` / `30m` mean "this long ago"; anything else must be an ISO timestamp. Parsed here
 * rather than with a library so a typo is a rejection, not a silently different window.
 *
 * `7d` / `12h` / `30m` 表示「多久以前」；其余必须是 ISO 时间戳。在这里自己解析而不用库，
 * 是为了让笔误变成一次拒绝，而不是悄悄换一个时间窗。
 */
function parseSince(raw: string, now: Date): Date {
  const rel = /^(\d+)([dhm])$/.exec(raw);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2] === 'd' ? 86_400_000 : rel[2] === 'h' ? 3_600_000 : 60_000;
    return new Date(now.getTime() - n * unit);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new ArgError(`--since 不是 ISO 时间戳，也不是 <数字><d|h|m>：${raw}`);
  }
  return parsed;
}

function parseLimit(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
    throw new ArgError(`--limit 必须是 1..${MAX_LIMIT} 的整数：${raw}`);
  }
  return n;
}

interface Reading {
  caveat: string;
  generatedAt: string;
  window: { since: string; until: string };
  coverage: {
    /** Rows actually walked. */
    checked: number;
    /** Rows inside the window, before the cap — `checked < matched` means the cap bit. */
    matched: number;
    limit: number;
    truncated: boolean;
    auditRowIdRange: { from: number; to: number } | null;
  };
  unreachable: Array<{ rowType: string; count: number; reasons: string[] }>;
  notApplicable: Array<{ rowType: string; count: number }>;
}

async function readReachability(since: Date, limit: number, now: Date): Promise<Reading> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  const auditRepo = AppDataSource.getRepository(AiAuditLog);

  const windowed = () =>
    auditRepo.createQueryBuilder('a').where('a.createdAt >= :since', { since: since.toISOString() });

  const matched = await windowed().getCount();
  // Newest first, so hitting the cap drops the oldest rows rather than the ones being asked about.
  // 取最新的在前：触到上限时丢的是更早的行，而不是提问者关心的那些。
  const picked = await windowed()
    .select('a.id', 'id')
    .orderBy('a.id', 'DESC')
    .limit(limit)
    .getRawMany<{ id: number }>();

  const ids = picked.map((r) => Number(r.id));
  const report = await checkAuditReachability(ids, {
    auditLogs: auditRepo,
    claims: AppDataSource.getRepository(AiWriteClaim),
    effects: AppDataSource.getRepository(AiToolSideEffect),
    confirmations: AppDataSource.getRepository(AiConfirmationRequest),
  });

  return {
    caveat: CAVEAT,
    generatedAt: now.toISOString(),
    window: { since: since.toISOString(), until: now.toISOString() },
    coverage: {
      checked: report.checked,
      matched,
      limit,
      truncated: matched > ids.length,
      auditRowIdRange:
        ids.length === 0 ? null : { from: Math.min(...ids), to: Math.max(...ids) },
    },
    unreachable: report.unreachable,
    notApplicable: report.notApplicable,
  };
}

function printHuman(r: Reading): void {
  const c = r.coverage;
  console.log('口径 / Caveat');
  console.log(`  ${CAVEAT}`);
  console.log('');
  console.log('覆盖 / Coverage  (read this before the numbers / 先看这一段)');
  console.log(`  窗口        ${r.window.since} → ${r.window.until}`);
  console.log(
    `  行数        窗口内 ${c.matched} 行，走查 ${c.checked} 行（上限 ${c.limit}${c.truncated ? '，已截断' : '，未截断'}）`,
  );
  console.log(
    `  审计行 id   ${c.auditRowIdRange ? `#${c.auditRowIdRange.from}–#${c.auditRowIdRange.to}` : '（窗口内没有审计行）'}`,
  );
  if (c.truncated) {
    console.log(`  ⚠ 只走了最新的 ${c.checked} 行 —— 缩小 --since 或抬高 --limit 再看剩下的。`);
  }
  console.log('');
  console.log('读数 / Reading');
  if (c.checked === 0) {
    // An empty window is not a clean bill of health. Saying "none unreachable" here would read as
    // "everything is linked" when in fact nothing was looked at.
    // 空窗口不是体检报告。「没有走不到的」会被读成「全都链上了」，而实际上什么都没看。
    console.log('  没有走查任何行 —— 这不是「都可达」，是「没问」。放宽 --since 再取。');
  } else if (r.unreachable.length === 0) {
    console.log(`  走不到的 row type：无（窗口内 ${c.checked} 条都在占位行处接上了）`);
  } else {
    console.log('  走不到的 row type：');
    for (const g of r.unreachable) {
      console.log(`    ${g.rowType.padEnd(13)} ${String(g.count).padStart(6)} 行   原因 ${g.reasons.join(', ')}`);
    }
  }
  if (r.notApplicable.length > 0) {
    console.log('  按设计没有目标（不是缺口）：');
    for (const n of r.notApplicable) console.log(`    ${n.rowType.padEnd(13)} ${String(n.count).padStart(6)} 行`);
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  let sinceRaw: string | null = null;
  let limitRaw: string | null = null;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--since') sinceRaw = argv[++i] ?? '';
    else if (a === '--limit') limitRaw = argv[++i] ?? '';
    else if (a === '--json') json = true;
    else if (a === '--help' || a === '-h') {
      console.log(USAGE);
      return 0;
    } else {
      console.error(`未知参数：${a}\n\n${USAGE}`);
      return 1;
    }
  }

  const now = new Date();
  let since: Date;
  let limit: number;
  try {
    since = sinceRaw === null ? new Date(now.getTime() - DEFAULT_WINDOW_MS) : parseSince(sinceRaw, now);
    limit = limitRaw === null ? DEFAULT_LIMIT : parseLimit(limitRaw);
  } catch (err) {
    if (err instanceof ArgError) {
      console.error(`✗ ${err.message}\n\n${USAGE}`);
      return 1;
    }
    throw err;
  }

  let reading: Reading;
  try {
    reading = await readReachability(since, limit, now);
  } catch (err) {
    // Exit 2 exists so a broken database is never read as "nothing unreachable".
    // 退出码 2 的意义：库坏了**不能**被读成「没有走不到的」。
    console.error(`✗ 读数取不到：${(err as Error).message}`);
    return 2;
  }

  if (json) console.log(JSON.stringify(reading));
  else printHuman(reading);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`✗ ${(err as Error).message}`);
    process.exitCode = 2;
  })
  .finally(() => {
    if (AppDataSource.isInitialized) void AppDataSource.destroy();
  });
