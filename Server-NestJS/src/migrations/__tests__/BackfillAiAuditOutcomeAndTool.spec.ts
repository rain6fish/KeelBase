// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { BackfillAiAuditOutcomeAndTool1839000000000 } from '../1839000000000-BackfillAiAuditOutcomeAndTool';
import { deriveOutcome, deriveTool, BackfillRow } from '../../ai/audit/audit-outcome';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob 是**非递归**的，只有放进子目录才能既与
 * 迁移同处、又不被 TypeORM 当迁移加载。
 *
 * 用真实 QueryRunner 驱动迁移类本身、不手抄 SQL，避免测试与迁移漂移。
 *
 * 这里钉的是三件事，而不是「迁移跑得通」：
 * 1. **规则本身** —— `deriveOutcome` / `deriveTool` 逐形状的取值，含两侧写入方给出的每一种形状；
 * 2. **推不出来的确实是 NULL** —— 失败与待批在盘上无法分辨，它们不许被猜成两者之一；
 * 3. **已经填过的行不动** —— 再跑一次是空操作（`WHERE outcome IS NULL` 让它天然幂等）。
 *
 * ⚠ 还有一件**不在这里**、但读者必须知道的事：`blocked` 与 `refused` 的判法与**旧读取方**不同，
 * 且是**故意**的 —— 旧规则把任何带 `authorization` 的拒绝都算 blocked，而这一列只把点名
 * `risk_policy` 的那种算 blocked。⇒ 切换读点之后，历史数据的 `blocked` 数**会变小**、`refused` 从
 * 零变正。这不是回归，是 `C-3` 存在的理由。
 */
const PRE_STATE_TABLE = `CREATE TABLE "ai_audit_logs" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "action" varchar NOT NULL,
  "detail" text,
  "is_error" boolean NOT NULL DEFAULT (0),
  "authorization" text,
  "outcome" varchar(32),
  "tool" varchar(64))`;

/** Row shape the assertions read. */
interface StoredRow {
  id: number;
  action: string;
  outcome: string | null;
  tool: string | null;
}

describe('1839000000000 backfill of outcome / tool', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  const migration = new BackfillAiAuditOutcomeAndTool1839000000000();

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    });
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.query(PRE_STATE_TABLE);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  /** The rows every case starts from — one per shape the two writers can produce. */
  const insert = (
    action: string,
    detail: string | null,
    isError: boolean,
    authorization: string | null,
  ) =>
    queryRunner.query(
      `INSERT INTO "ai_audit_logs" ("action", "detail", "is_error", "authorization") VALUES (?, ?, ?, ?)`,
      [action, detail, isError ? 1 : 0, authorization],
    );

  const stored = async (): Promise<StoredRow[]> =>
    queryRunner.query(`SELECT "id", "action", "outcome", "tool" FROM "ai_audit_logs" ORDER BY "id"`);

  it('gives each tool_call row the code its writer would have given it', async () => {
    await insert('tool_call', 'query_customers({"limit":5})', false, '{"allow":true}');
    await insert('tool_call', 'send_email({})', true, '[{"name":"risk_policy"}]');
    await insert('tool_call', 'delete_customer({})', true, '[{"name":"role_not_allowed"}]');

    await migration.up(queryRunner);

    const rows = await stored();
    expect(rows.map((r) => [r.outcome, r.tool])).toEqual([
      ['executed', 'query_customers'],
      ['blocked', 'send_email'],
      ['refused', 'delete_customer'],
    ]);
  });

  it('leaves a row alone when the two shapes it cannot tell apart are both possible', async () => {
    // A failed tool call and one held for a second person's approval store the same three values:
    // isError, no authorization, a message. Neither may be guessed into `failed` or `pending`.
    await insert('tool_call', 'create_task({})', true, null);

    await migration.up(queryRunner);

    const [row] = await stored();
    expect(row.outcome).toBeNull();
    // `tool` is still derivable for it — the name is in the detail whatever the outcome was.
    expect(row.tool).toBe('create_task');
  });

  it('reads a confirmation row at either shape, and says nothing for a run-level one', async () => {
    await insert('tool_confirmation', 'create_event({"title":"a"}) → approve (trusted)', false, null);
    await insert('tool_confirmation', 'create_event({"title":"a"}) → decline', true, null);
    await insert('tool_confirmation', 'create_event({"title":"a"}) → approve', false, null);
    await insert('tool_confirmation', 'create_task({}) → pending_approval', false, null);
    await insert('tool_confirmation', 'run(7f3c-1) 3 items → approve', false, null);

    await migration.up(queryRunner);

    const rows = await stored();
    expect(rows.map((r) => [r.outcome, r.tool])).toEqual([
      ['approved', 'create_event'],
      ['declined', 'create_event'],
      ['approved', 'create_event'],
      ['pending', 'create_task'],
      // A run-level decision covers several tools, and the writer leaves `tool` empty for it. The
      // old reader took the first token and called `run` a tool name; this one does not.
      ['approved', null],
    ]);
  });

  it('answers revoked for the revoke path and null for a row that is not a tool outcome', async () => {
    await insert('effect_revoke', 'delete_customer revoked (effect 12, task -> deleted)', false, null);
    await insert('chat', '帮我看看上周的客户', false, null);
    await insert('knowledge', '检索：退款政策', false, null);

    await migration.up(queryRunner);

    const rows = await stored();
    expect(rows.map((r) => r.outcome)).toEqual(['revoked', null, null]);
  });

  it('does not touch a row that already carries an outcome', async () => {
    await queryRunner.query(
      `INSERT INTO "ai_audit_logs" ("action", "detail", "is_error", "authorization", "outcome", "tool") VALUES ('tool_call', 'send_email({})', 1, NULL, 'failed', 'send_email')`,
    );

    await migration.up(queryRunner);

    const [row] = await stored();
    expect([row.outcome, row.tool]).toEqual(['failed', 'send_email']);
  });

  it('is idempotent: a second run changes nothing', async () => {
    await insert('tool_call', 'query_customers({})', false, '{"allow":true}');
    await insert('tool_call', 'create_task({})', true, null);

    await migration.up(queryRunner);
    const first = await stored();
    await migration.up(queryRunner);

    expect(await stored()).toEqual(first);
  });
});

describe('the two rules, unit-wise', () => {
  const row = (over: Partial<BackfillRow>): BackfillRow => ({
    action: 'tool_call',
    detail: null,
    isError: false,
    authorization: null,
    ...over,
  });

  it('is not fooled by a tool whose name contains `run`', () => {
    // The run-level guard is anchored (`^run(`), so a tool named `run_report` is still a tool.
    expect(deriveTool(row({ detail: 'run_report({"days":7})' }))).toBe('run_report');
    expect(deriveTool(row({ detail: 'run(7f3c-1) 3 items → approve' }))).toBeNull();
  });

  it('takes the tool from a detail it cannot otherwise classify', () => {
    expect(deriveTool(row({ detail: 'no_parens_at_all' }))).toBeNull();
    expect(deriveTool(row({ detail: 'anything(' }))).toBe('anything');
  });

  it('answers null rather than a word for an action that is not a tool outcome', () => {
    expect(deriveOutcome(row({ action: 'flow_node', detail: 'x' }))).toBeNull();
    expect(deriveOutcome(row({ action: 'delegate', detail: 'x' }))).toBeNull();
  });

  it('does not read the message to tell a risk policy from any other refusal', () => {
    // The row says `refused` in prose but names no risk policy: the column must follow the reasons,
    // because reading that sentence is the parsing this column exists to remove.
    const r = row({
      detail: 'send_email({})',
      isError: true,
      authorization: '[{"name":"role_not_allowed"}]',
    });
    expect(deriveOutcome(r)).toBe('refused');
  });
});
