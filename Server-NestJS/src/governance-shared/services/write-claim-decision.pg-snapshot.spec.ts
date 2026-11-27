// SPDX-License-Identifier: Apache-2.0

import { DataSource, In } from 'typeorm';
import {
  AiWriteClaim,
  WRITE_CLAIM_DECISION_STATE,
  WRITE_CLAIM_STATUS,
} from '../entities/ai-write-claim.entity';
import { AiAuditLog } from '../entities/ai-audit-log.entity';
import { TargetStatusLookupRow } from '../entities/target-status-lookup.entity';
import { AuditChainLock } from '../../common/audit-chain/audit-chain-lock.entity';
import { AuditChainService } from '../../common/audit-chain/audit-chain.service';
import { AuditService } from './audit.service';
import {
  TargetReleaseTrigger,
  WriteClaimDecisionService,
} from './write-claim-decision.service';

/**
 * F-130 / F-132: the release evidence is **one snapshot** — on a real Postgres, under concurrent writes.
 *
 * The shape test next door (`write-claim-decision.service.spec.ts`) reads the SQL and pins "exactly one
 * SELECT, with a window count". A statement's shape cannot show what a **concurrent insert** does to it,
 * and SQLite's single-writer, serialised model cannot produce the race at all. This file is the missing
 * half: two real connections to one real Postgres, one inserting lookup rows without pause, the other
 * reading the evidence — and every decision row it produces must be self-consistent.
 *
 * **What isolation this covers.** The deployment runs Postgres at its default `read committed`, where
 * every statement takes its own snapshot. The invariant holds *because* both the count and the newest
 * three come from one statement in that snapshot. This test does **not** check the isolation level: it
 * runs under whatever the server is configured with, reports that reading, and would still hold on a
 * stricter level. What it cannot survive is the implementation splitting the read in two — the point is
 * that the violation gets caught by running **here, on Postgres**, not by declaring the assumption.
 * The contract's single source for this is `docs/revoke-contract.spec.md` §6; not restated here.
 *
 * **When it runs.** Only with `DB_TYPE=postgres`. Everywhere else (SQLite unit runs, other environments)
 * the suite skips cleanly and reports zero assertions — it does not pretend to have verified anything.
 * CI sets `PG_SNAPSHOT_REQUIRED=1` in the Postgres lane: if that lane is ever misconfigured so the suite
 * would skip, the suite fails instead of turning green. A skipped test proves nothing.
 *
 * F-130 / F-132：释放证据是**一个快照** —— 在真 Postgres 上、并发写之下。
 *
 * 隔壁的形状测试（`write-claim-decision.service.spec.ts`）读 SQL、钉住「恰好一条 SELECT 且含窗口计数」。
 * 一条语句的形状看不出**并发插入**对它做了什么，而 SQLite 单写者、串行的模型根本造不出这个竞争。本文件
 * 补的就是那一半：两条真连接连同一个真 Postgres，一条不停插入读数行，另一条读证据 —— 它产出的每条决定
 * 行都必须自洽。
 *
 * **覆盖的是哪种隔离。** 部署跑 Postgres 默认的 `read committed`，每条语句各自取快照。不变量成立，
 * 正是因为次数与最近三条出自该快照里的**一条语句**。本用例**不检查**隔离级别：它在服务器当前配置下运行、
 * 把那项读数报出来，且更严格的级别下同样成立。它挡不住的是「把读拆成两次」的实现 —— 关键在于违规由
 * **在 Postgres 上跑**捕获，而不是由声明这份假设捕获。契约的单源是 `docs/revoke-contract.spec.md` §6，
 * 此处不复述第二份。
 *
 * **何时运行。** 仅 `DB_TYPE=postgres`。其它场合（SQLite 单测、别的环境）整套干净跳过、断言数为零 ——
 * 它不假装验证过什么。CI 在 Postgres lane 置 `PG_SNAPSHOT_REQUIRED=1`：若该 lane 配错、本套会跳过，
 * 则改为**失败**而不是转绿。跳过的测试什么也没证明。
 */
jest.setTimeout(120_000);

const pgTarget = (process.env.DB_TYPE ?? 'sqlite').toLowerCase() === 'postgres';
const required = process.env.PG_SNAPSHOT_REQUIRED === '1';

if (required && !pgTarget) {
  // A lane that says "this must run on Postgres" and then skips is worse than a red lane: it reports
  // the guarantee while checking nothing.
  // 一条自称「必须在 Postgres 上跑」却跳过的 lane，比红还糟：它报告的是保证，检查的却是空。
  throw new Error(
    'PG_SNAPSHOT_REQUIRED=1 but DB_TYPE is not postgres — refusing to skip. ' +
      'The Postgres lane must set DB_TYPE=postgres (and DB_HOST/DB_PORT/DB_USER/DB_PASSWORD).',
  );
}

const describePostgres = pgTarget ? describe : describe.skip;

/** A decision row's copied evidence, as written to `ai_audit_logs.release_lookups`. / 决定行拷贝的证据，落库在 `ai_audit_logs.release_lookups`。 */
interface EvidenceItem {
  id: number;
  at: string;
  conclusion: string;
  reason: string | null;
  basis: string;
  lookedUpBy: string;
}

interface ReleaseEvidenceShape {
  count: number;
  askable: boolean | null;
  items: EvidenceItem[];
}

describePostgres('F-130/F-132：释放证据的计数与条目出自同一快照（真 Postgres）', () => {
  const DB_NAME = (process.env.PG_SNAPSHOT_DB_NAME ?? 'keelbase_snapshot_test').toLowerCase();
  const ADMIN_DB = process.env.PG_SNAPSHOT_ADMIN_DB ?? 'postgres';

  const connection = () => ({
    type: 'postgres' as const,
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
  });

  let admin: DataSource;
  let reader: DataSource;
  let writer: DataSource;
  let service: WriteClaimDecisionService;
  /** The server's actual isolation for this connection — reported, never asserted (see the header). / 该连接上服务器的实际隔离 —— 只报告、不断言（理由见文件头）。 */
  let isolation = 'unread';
  let seq = 0;

  const claims = () => reader.getRepository(AiWriteClaim);
  const lookups = () => reader.getRepository(TargetStatusLookupRow);
  const auditRows = () => reader.getRepository(AiAuditLog);
  /** The writer's own connection: an insert has to commit on a different session to race a read. / 写方自己的连接：插入要在另一条会话上提交，才与读构成竞争。 */
  const writerLookups = () => writer.getRepository(TargetStatusLookupRow);

  /** A hold old enough to release: past `REVOKE_STALE_MINUTES` (60 here). / 足够旧、可释放的占位。 */
  const STALE_AT = () => new Date(Date.now() - 90 * 60_000);

  const seedClaim = async (): Promise<AiWriteClaim> => {
    seq += 1;
    return claims().save(
      claims().create({
        idempotencyKey: `pg-snapshot-${process.pid}-${seq}`,
        userId: '7',
        conversationId: 'conv-pg',
        toolName: 'send_email',
        argsHash: '0123456789abcdef',
        status: WRITE_CLAIM_STATUS.CLAIMED,
        decisionState: WRITE_CLAIM_DECISION_STATE.OPEN,
        claimedAt: STALE_AT(),
        attempts: 1,
      }),
    );
  };

  /**
   * One reading row. `at` is written explicitly, spaced a millisecond apart, so the (at, id) order the
   * evidence copies is the order this test intended; the writer's own rows come later from `now()`.
   *
   * 一条读数行。`at` 显式写入、彼此隔一毫秒，于是证据拷贝出的 (at, id) 顺序就是本用例指定的顺序；
   * 写入方自己的行随后由 `now()` 产生、更晚。
   */
  const seedLookup = async (
    key: string,
    index: number,
    over: Partial<TargetStatusLookupRow> = {},
  ): Promise<TargetStatusLookupRow> => {
    const saved = await lookups().save(
      lookups().create({
        idempotencyKey: key,
        toolName: 'send_email',
        lookedUpBy: 'admin-2',
        asUserId: '7',
        queryMethod: 'GET',
        queryPath: `/actions/${key}`,
        conclusion: 'not_executed',
        reason: null,
        ...over,
      }),
    );
    await lookups().update(saved.id, { at: new Date(Date.UTC(2026, 10, 22, 10, 0, index)) });
    return saved;
  };

  const trigger = (): TargetReleaseTrigger => ({
    byUserId: 'system:sweep',
    automatic: true,
    conclusion: 'not_executed',
    queryMethod: 'GET',
    queryPath: '/status',
    queriedAt: new Date().toISOString(),
  });

  /**
   * Run a writer loop on its own connection until `stop()` is called. One insert per iteration, each
   * its own committed statement, then a yield of `delayMs` so the reader's statements can interleave
   * with them. Deterministic in structure (no sleeping until a guess is right): the loop stops when
   * asked, and the count of inserts it managed is available to the assertions.
   *
   * 在另一条连接上跑一个写入循环，直到调用 `stop()`。每轮一次插入、各自是一条已提交的语句，随后按
   * `delayMs` 让出一次，使读方的语句能插进这些写之间。结构确定（不靠睡到猜对为止）：叫停即停，
   * 实际插入了多少行供断言读取。
   */
  const startWriter = (key: string, delayMs = 0) => {
    let stopped = false;
    let inserted = 0;
    let failure: unknown = null;
    const done = (async () => {
      while (!stopped) {
        try {
          await writerLookups().insert({
            idempotencyKey: key,
            toolName: 'send_email',
            lookedUpBy: 'system:sweep',
            asUserId: '7',
            queryMethod: 'GET',
            queryPath: `/actions/${key}`,
            conclusion: 'unknown',
            reason: 'timeout',
          });
          inserted += 1;
        } catch (err) {
          failure = err;
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    })();
    return {
      stop: async () => {
        stopped = true;
        await done;
        return { inserted, failure };
      },
    };
  };

  /**
   * The property, stated once. `count` and `items` must come from one snapshot, and the check does not
   * need to know **when** that snapshot was taken:
   *
   *   - ids only grow, and this test's single writer commits one insert per statement, so the newest
   *     copied id is the highest id the statement saw;
   *   - every row the snapshot saw has an id at or below that watermark;
   *   - every row at or below the watermark was already committed when the statement ran.
   *
   * So `count` must equal the number of rows at or below the watermark. A read split in two — count
   * first, items second — lands here exactly as the contradiction we promised to catch: "the count
   * says 4, the items name 5". The check throws (rather than using `expect`) so the failure carries the
   * whole reading — isolation, count, watermark, item ids — not just a diff.
   *
   * 这条性质只说一次。`count` 与 `items` 必须出自同一快照，而检查无需知道快照**何时**取的：
   *
   *   - id 只增，且本用例的写方一条语句提交一行，故被拷贝的最新 id 就是该语句见到的最大 id；
   *   - 该快照见到的每一行，id 都小于或等于这个水位；
   *   - 水位及以下的每一行，在那条语句运行时都已提交。
   *
   * 于是 `count` 必须等于水位及以下的行数。拆成两次读（先数、后取条目）在这里恰好呈现为我们承诺要抓的
   * 矛盾：「计数说 4、条目点名了 5 条」。检查用 throw（而非 `expect`），让失败带上整份读数 —— 隔离级别、
   * 计数、水位、条目 id —— 而不只是一个 diff。
   */
  const expectOneSnapshot = async (
    evidence: ReleaseEvidenceShape,
    key: string,
    label: string,
  ): Promise<void> => {
    const itemIds = evidence.items.map((item) => item.id);
    const describe = () =>
      `${label}: count=${evidence.count}, items=[${itemIds.join(',')}], isolation=${isolation}`;

    if (evidence.items.length > 3) {
      throw new Error(`more than three items copied — ${describe()}`);
    }
    if (evidence.items.length !== Math.min(3, evidence.count)) {
      throw new Error(
        `items.length must be min(3, count) — ${describe()} (item count ${evidence.items.length})`,
      );
    }
    for (let i = 1; i < itemIds.length; i += 1) {
      if (itemIds[i - 1] <= itemIds[i]) {
        throw new Error(`items are not newest-first by id — ${describe()}`);
      }
    }
    if (evidence.items.length === 0) {
      if (evidence.count !== 0) throw new Error(`count without items — ${describe()}`);
      return;
    }

    const watermark = itemIds[0];
    // Everything at or below the watermark is exactly what that statement saw (see above), so its
    // size is the count and its newest three are the items.
    // 水位及以下的一切正是那条语句见到的集合（理由见上），故它的大小是计数、它的最新三条是条目。
    const [row] = (await reader.query(
      'SELECT COUNT(*)::int AS total FROM "ai_target_status_lookups" ' +
        'WHERE "idempotency_key" = $1 AND "id" <= $2',
      [key, watermark],
    )) as Array<{ total: number }>;
    if (evidence.count !== row.total) {
      throw new Error(
        `count disagrees with the rows at or below the watermark #${watermark}: ` +
          `statement says ${evidence.count}, table says ${row.total} — ${describe()}`,
      );
    }

    // The items must be the **newest three** of that set, in the service's own order — not merely
    // three descending ids.
    // 条目必须是该集合的**最新三条**、按服务自己的排序 —— 而不只是三个递减的 id。
    const newest = (await reader.query(
      'SELECT "id" FROM "ai_target_status_lookups" WHERE "idempotency_key" = $1 AND "id" <= $2 ' +
        'ORDER BY "at" DESC, "id" DESC LIMIT 3',
      [key, watermark],
    )) as Array<{ id: number }>;
    const newestIds = newest.map((entry) => entry.id);
    if (JSON.stringify(newestIds) !== JSON.stringify(itemIds)) {
      throw new Error(
        `items are not the newest three at or below the watermark #${watermark}: ` +
          `table says [${newestIds.join(',')}] — ${describe()}`,
      );
    }
  };

  /** Every copied entry must equal the row it names — the copy is evidence, not a re-statement. / 每条拷贝必须等于它点名的那一行 —— 拷贝是证据，不是复述。 */
  const expectCopiesMatchSources = async (items: EvidenceItem[]): Promise<void> => {
    if (items.length === 0) return;
    const sources = await lookups().find({ where: { id: In(items.map((item) => item.id)) } });
    const byId = new Map(sources.map((source) => [source.id, source]));
    for (const item of items) {
      const source = byId.get(item.id);
      expect(source).toBeDefined();
      expect(item).toEqual({
        id: source!.id,
        at: source!.at.toISOString(),
        conclusion: source!.conclusion,
        reason: source!.reason ?? null,
        basis: source!.basis ?? 'unknown',
        lookedUpBy: source!.lookedUpBy,
      });
    }
  };

  const evidenceOf = (row: AiAuditLog): ReleaseEvidenceShape => {
    expect(row.releaseLookups).toBeTruthy();
    return JSON.parse(row.releaseLookups!) as ReleaseEvidenceShape;
  };

  beforeAll(async () => {
    if (!/^[a-z_][a-z0-9_]*$/.test(DB_NAME) || !/^[a-z_][a-z0-9_]*$/.test(ADMIN_DB)) {
      throw new Error(`unsafe database identifier: ${DB_NAME} / ${ADMIN_DB}`);
    }
    // The test owns its database: it is created here and dropped in `afterAll`, so a run can never be
    // polluted by — or pollute — whatever else the server holds. Reusing a name left by a crashed run
    // is fine; the tables are synchronised and emptied before each case.
    // 测试独占自己的库：这里建、`afterAll` 删，于是任何一次运行都不会被服务器上的其它东西污染、也不污染
    // 它们。上次崩溃留下的同名库可以复用 —— 每例之前都会同步并清空表。
    admin = new DataSource({ ...connection(), database: ADMIN_DB });
    await admin.initialize();
    const exists = (await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      DB_NAME,
    ])) as unknown[];
    if (!exists.length) await admin.query(`CREATE DATABASE "${DB_NAME}"`);

    const entities = [AiWriteClaim, AiAuditLog, TargetStatusLookupRow, AuditChainLock];
    reader = new DataSource({ ...connection(), database: DB_NAME, entities, synchronize: true });
    await reader.initialize();
    // A second pool, so its statements run on a different session — the same session would serialise
    // them and the race would not exist.
    // 第二个连接池，它的语句落在另一条会话上 —— 同一条会话会把语句串起来，竞争就不存在了。
    writer = new DataSource({
      ...connection(),
      database: DB_NAME,
      entities: [TargetStatusLookupRow],
    });
    await writer.initialize();

    const [iso] = (await reader.query(
      "SELECT current_setting('transaction_isolation') AS level",
    )) as Array<{ level: string }>;
    isolation = iso.level;

    const chain = new AuditChainService({ get: () => undefined } as never);
    const audit = new AuditService(auditRows(), chain, reader);
    service = new WriteClaimDecisionService(claims(), lookups(), audit, {
      get: (key: string) => (key === 'REVOKE_STALE_MINUTES' ? 60 : undefined),
    } as never);
  });

  beforeEach(async () => {
    await reader.query(
      'TRUNCATE TABLE "ai_write_claims", "ai_target_status_lookups", "ai_audit_logs", "audit_chain_lock" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await writer?.destroy().catch(() => undefined);
    await reader?.destroy().catch(() => undefined);
    if (admin?.isInitialized) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
      } catch (err) {
        // Leftover database is noise, not a failed guarantee — say so instead of reddening the lane.
        // 留下的库是噪音，不是失败的保证 —— 说出来，而不是让 lane 变红。
        console.warn(`could not drop ${DB_NAME}: ${(err as Error).message}`);
      }
      await admin.destroy();
    }
  });

  it('并发询问下，每次证据读取的计数与最近三条都自洽（同一快照）', async () => {
    const INITIAL = 4;
    const DECISIONS = 40;
    const claim = await seedClaim();
    for (let i = 0; i < INITIAL; i += 1) await seedLookup(claim.idempotencyKey, i);

    const writerLoop = startWriter(claim.idempotencyKey);
    const auditIds: number[] = [];
    try {
      for (let i = 0; i < DECISIONS; i += 1) {
        // The automatic path (`recordTargetRelease`) is the one that runs while asks are in flight:
        // it is repeatable, it writes the same `claim_release` row a manual release writes, and it is
        // exactly the read under test. A manual release is one-shot per hold, so it cannot be the
        // hammer; it gets its own case below.
        // 自动路径（`recordTargetRelease`）才是询问在途时真正会跑的那条：可重复、写的是与人工释放相同的
        // `claim_release` 行，正是被测的读取。人工释放对每条占位只有一次，做不了锤子；它在下面单列一例。
        // `true` stands in for the reconcile path after its insert landed — nothing is missing here,
        // so this lane must not acquire the "this ask was not recorded" marker.
        // `true` 代指的是插入已落库之后的对账路径 —— 这里什么都没缺，故这条 lane 不得带上「本次未
        // 记录」的标记。
        auditIds.push(await service.recordTargetRelease(claim, trigger(), true));
      }
    } finally {
      const { inserted, failure } = await writerLoop.stop();
      expect(failure).toBeNull();
      // If the writer never interleaved, the case would pass without testing anything; the distinct
      // totals asserted below are the other half of that guard.
      // 写方若从未插入，这一例不测而绿；下面断言的不同总数是这条守卫的另一半。
      expect(inserted).toBeGreaterThan(0);
    }

    const rows = await auditRows().find({ where: { id: In(auditIds) }, order: { id: 'ASC' } });
    expect(rows).toHaveLength(DECISIONS);

    const totals = new Set<number>();
    const copied: EvidenceItem[] = [];
    for (const [index, row] of rows.entries()) {
      const evidence = evidenceOf(row);
      await expectOneSnapshot(evidence, claim.idempotencyKey, `decision ${index + 1}/${DECISIONS}`);
      copied.push(...evidence.items);
      totals.add(evidence.count);
    }

    // The stream was live: at least two different totals were read, and none saw fewer rows than were
    // seeded. (If this ever fails, the case proved nothing — it did not merely pass.)
    // 数据流是活的：至少读到过两个不同总数，且没有一个少于种子行数。（这里若失败，说明这一例什么也没证明
    // —— 它并非「恰好通过」。）
    expect(totals.size).toBeGreaterThan(1);
    for (const total of totals) expect(total).toBeGreaterThanOrEqual(INITIAL);

    await expectCopiesMatchSources(copied);
  });

  it('并发询问下的真实释放：成功那一行仍自洽，陈旧视图的拒绝不冒充证据行', async () => {
    const claim = await seedClaim();
    for (let i = 0; i < 3; i += 1) await seedLookup(claim.idempotencyKey, i);

    // A 5 ms cadence: fast enough that asks land between a screen read and a release (a real race),
    // slow enough that a retry has a window to succeed. A tight loop made **every** attempt stale —
    // the ledger was right to refuse, and the case could never produce the row it examines.
    // 5 毫秒的节奏：快到询问能落进「读屏幕」与「释放」之间（是真竞争），又慢到重试有成功的窗口。
    // 紧循环让**每一次**尝试都陈旧 —— 账本拒绝得对，而这一例永远产不出它要检查的那一行。
    const writerLoop = startWriter(claim.idempotencyKey, 5);
    const refusals: string[] = [];
    const attempts = 100;
    let releasedAuditId: number | null = null;
    let inserted = 0;
    try {
      // An ask landing between the screen's read and the release makes the view stale, and the ledger
      // refuses — correctly. So retry with a fresh view; the point is the release that **succeeds**,
      // whose evidence must still be one snapshot of a stream that kept moving.
      // 屏幕读取与释放之间落进一次询问，视图就陈旧了，账本会拒绝 —— 这是对的。故用新视图重试；要看的是
      // **成功**的那次释放 —— 它的证据仍必须是不断移动的数据流的一个快照。
      for (let attempt = 0; attempt < attempts && releasedAuditId === null; attempt += 1) {
        const latest = await lookups().find({
          where: { idempotencyKey: claim.idempotencyKey },
          order: { at: 'DESC', id: 'DESC' },
          take: 1,
        });
        const current = await claims().findOneByOrFail({ id: claim.id });
        const result = await service.release(
          claim.id,
          { userId: 'admin-1', username: 'ops-admin' },
          {
            note: 'F-130/F-132：并发询问下释放',
            view: {
              decisionState: current.decisionState,
              lastLookupId: latest[0]?.id ?? null,
            },
          },
        );
        if (result.outcome === 'released_unknown') {
          releasedAuditId = result.auditRowId;
        } else {
          refusals.push(result.outcome);
        }
      }
    } finally {
      const stopped = await writerLoop.stop();
      inserted = stopped.inserted;
      expect(stopped.failure).toBeNull();
      expect(inserted).toBeGreaterThan(0);
    }

    if (releasedAuditId === null) {
      const byOutcome = refusals.reduce<Record<string, number>>((acc, outcome) => {
        acc[outcome] = (acc[outcome] ?? 0) + 1;
        return acc;
      }, {});
      throw new Error(
        `no release succeeded in ${attempts} attempts while ${inserted} readings were inserted; ` +
          `refusals=${JSON.stringify(byOutcome)}, isolation=${isolation}`,
      );
    }
    const row = await auditRows().findOneByOrFail({ id: releasedAuditId! });
    const evidence = evidenceOf(row);
    await expectOneSnapshot(evidence, claim.idempotencyKey, 'manual release');
    await expectCopiesMatchSources(evidence.items);

    // Only staleness may refuse here (the hold is claimed, old enough, and not closed). And a refusal
    // is not a release: it carries no evidence column — the contract says that column backs releases.
    // 这里只有陈旧能构成拒绝（占位仍是 claimed、够旧、未关闭）。且拒绝不是释放：它不带证据列 ——
    // 契约里那一列是释放决定的背书。
    expect(refusals.every((outcome) => outcome === 'stale_view')).toBe(true);
    const refusalRows = await auditRows().find({
      where: { action: 'claim_release' },
      order: { id: 'ASC' },
    });
    const withoutEvidence = refusalRows.filter((r) => r.releaseLookups === null);
    expect(withoutEvidence).toHaveLength(refusals.length);
    for (const refusal of withoutEvidence) {
      expect(refusal.detail).toContain('release refused (stale_view)');
    }
  });

  it('检查器本身有牙：把两次读的结果拼在一起，必被判为自相矛盾', async () => {
    // A green consistency check proves nothing unless a broken reading fails it. This fabricates the
    // exact symptom a split read produces — the count from before an insert, the newest three from
    // after it — and requires the check to refuse it.
    // 一致的检查只有在「坏读数会被判红」时才证明得了什么。这里伪造拆分读的确切症状 —— 计数取插入前、
    // 最近三条取插入后 —— 并要求检查拒绝它。
    const claim = await seedClaim();
    const seeded: TargetStatusLookupRow[] = [];
    for (let i = 0; i < 5; i += 1) seeded.push(await seedLookup(claim.idempotencyKey, i));

    const split = {
      count: 4,
      askable: null,
      items: seeded
        .slice(-3)
        .reverse()
        .map((row) => ({
          id: row.id,
          at: row.at.toISOString(),
          conclusion: row.conclusion,
          reason: row.reason ?? null,
          basis: row.basis ?? 'unknown',
          lookedUpBy: row.lookedUpBy,
        })),
    };
    await expect(
      expectOneSnapshot(split, claim.idempotencyKey, 'fabricated split read'),
    ).rejects.toThrow(/count disagrees with the rows at or below the watermark/);

    // The same evidence, correctly counted, passes — so the teeth are not simply "always red".
    // 同一份证据、计数正确时通过 —— 于是这份牙不是「永远判红」。
    await expect(
      expectOneSnapshot(
        { ...split, count: 5 },
        claim.idempotencyKey,
        'the same rows, counted correctly',
      ),
    ).resolves.toBeUndefined();
  });
});
