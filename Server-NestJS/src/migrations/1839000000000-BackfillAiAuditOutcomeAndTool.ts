// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';
import { BackfillRow, deriveOutcome, deriveTool } from '../governance-shared/services/audit-outcome';

/**
 * C-3 backfill: give the rows written before `outcome` / `tool` existed the values the writers would
 * have given them.
 *
 * The columns were added by `1838000000000` as plain nullable columns with no backfill, so every row
 * written earlier is NULL. That is fine for a writer and useless for a reader: the evaluation plane's
 * whole point in reading a column is that the answer is there. Switching those readers over without
 * this migration would not just leave old rows blank — it would silently change the rates they
 * compute, because the old text rule and the column disagree exactly where C-3 corrected the old rule.
 *
 * The rules below are the writers' rules, read off the writers (`tool-call-audit.ts`, `ai.service.ts`,
 * the revoke path) and applied to what those rows already carry. Two of them are worth stating:
 *
 * - **`blocked` is not "any denial".** A row is `blocked` when its stored `authorization` names
 *   `risk_policy` — that gate refuses before anything reaches a decision. Every other refusal is
 *   `refused`. The old reader counted *any* denial as blocked, which is the conflation C-3 exists to
 *   undo, so the two readings differ here **on purpose**.
 * - **What cannot be derived is left NULL.** A `tool_call` row that failed, and one held for a second
 *   person's approval, carry the same three stored values (`isError`, no `authorization`, a message)
 *   and cannot be told apart after the fact. They stay NULL rather than being guessed into one of the
 *   two — which is also what the old reader did with them: it counted neither.
 *
 * 回填：把 `outcome` / `tool` 出现之前写下的行，补上写入侧本来会给它们的值。
 *
 * 两列由 `1838000000000` 以**普通可空列**加上、没有回填，故更早的每一行都是 NULL。对写入方这没问题，
 * 对读取方等于没用：评估面按列读的全部意义就在于答案在那儿。**不回填就切读点**，不只是让旧行空着——
 * 它会**静默改掉**算出来的率，因为旧文本规则与这一列**恰好在 C-3 纠正旧规则的地方**不一致。
 *
 * 下面的规则就是写入侧的规则，读自写入方（`tool-call-audit.ts`、`ai.service.ts`、撤销那条路），
 * 施加在那些行**本来就带着**的东西上。有两条值得写出来：
 *
 * - **`blocked` 不是「任何拒绝」**。一行的 `authorization` 点名 `risk_policy` 才是 `blocked`——那道闸
 *   在**任何东西到达裁决之前**就拒了。其余拒绝是 `refused`。旧读取方把**任何**拒绝都算 blocked，
 *   那正是 C-3 要拆掉的那种合并 ⇒ 两种读法**在这里**不一致，且是**故意的**。
 * - **推不出来的就留 NULL**。一次失败的工具调用，与一次被扣下等人复核的，**存下来的三个值完全一样**
 *   （`isError`、没有 `authorization`、一句消息），事后分辨不了。它们留 NULL，而不是猜成两者之一——
 *   旧读取方对它们本来也是**两个都不计**。
 */
export class BackfillAiAuditOutcomeAndTool1839000000000 implements MigrationInterface {
  name = 'BackfillAiAuditOutcomeAndTool1839000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Column names here are the **database's**, not the entity's property names: this is raw SQL and
    // the entity's `@Column({ name: 'is_error' })` mapping does not apply. Getting that wrong is what
    // the spec caught first — it fails loudly on `no such column: "isError"` rather than quietly
    // reading nothing and backfilling nothing.
    // 这里的列名是**数据库的**，不是实体的属性名：这是裸 SQL，实体的 `@Column({ name: 'is_error' })`
    // 映射在这里不生效。写错它的后果先被 spec 逮住了——它**响亮地**挂在 `no such column: "isError"`，
    // 而不是安静地读不到东西、于是什么都没回填。
    const rows: Array<{
      id: number;
      action: string;
      detail: string | null;
      is_error: boolean | number | null;
      authorization: string | null;
    }> = await queryRunner.query(
      `SELECT "id", "action", "detail", "is_error", "authorization" FROM "ai_audit_logs" WHERE "outcome" IS NULL`,
    );

    // One UPDATE per distinct pair rather than per row: the classification has few outcomes, so this
    // is a handful of statements however many rows there are.
    // 按 (outcome, tool) 去重后每对一条 UPDATE：分类的取值很少，故不管多少行，语句都是那么几条。
    const groups = new Map<string, { outcome: string | null; tool: string | null; ids: number[] }>();
    for (const row of rows) {
      const asRow: BackfillRow = {
        action: row.action,
        detail: row.detail,
        isError: row.is_error,
        authorization: row.authorization,
      };
      const outcome = deriveOutcome(asRow);
      const tool = deriveTool(asRow);
      const key = `${outcome ?? ''}\u0000${tool ?? ''}`;
      const group = groups.get(key) ?? { outcome, tool, ids: [] };
      group.ids.push(row.id);
      groups.set(key, group);
    }

    // This repository runs both drivers (sqlite in development, postgres in production) and the two
    // do not share a placeholder. Reading the driver off the connection is what keeps one migration
    // file honest on both, rather than writing `?` and finding out on the deployment that cares.
    // 本仓两种驱动都跑（开发 sqlite、生产 postgres），而两者的占位符不同。按连接取驱动，是让**一个**
    // 迁移文件在两边都诚实的原因——而不是写成 `?`，然后到真正要紧的那套部署上才发现。
    const postgres = queryRunner.connection.options.type === 'postgres';
    const placeholder = (n: number) => (postgres ? `$${n}` : '?');

    for (const { outcome, tool, ids } of groups.values()) {
      // A group with neither value is the rows the rules could not classify — leaving them alone is
      // the point, so they are skipped rather than written as NULL over NULL.
      // 两个值都推不出来的那一组，就是规则分不了类的行——**不碰它们**正是本意，故跳过，而不是拿 NULL
      // 去盖 NULL。
      if (outcome === null && tool === null) continue;
      // Ids are numbers read from the table itself, never user input.
      // 这些 id 是从表里读出来的数字，不是外部输入。
      //
      // Chunked: one statement per group can exceed the driver's bind-parameter limit (SQLite 32766,
      // PostgreSQL 65535) on a long-lived install, and the upgrade would fail rather than backfill.
      // 分批：每组一条语句在长期运行的安装上可能超过驱动的绑定参数上限（SQLite 32766、PostgreSQL
      // 65535），升级会直接失败、而不是完成回填。
      const CHUNK = 500;
      for (let offset = 0; offset < ids.length; offset += CHUNK) {
        const batch = ids.slice(offset, offset + CHUNK);
        const idPlaceholders = batch.map((_, i) => placeholder(i + 3)).join(',');
        await queryRunner.query(
          `UPDATE "ai_audit_logs" SET "outcome" = ${placeholder(1)}, "tool" = ${placeholder(2)} WHERE "id" IN (${idPlaceholders})`,
          [outcome, tool, ...batch],
        );
      }
    }
  }

  public async down(): Promise<void> {
    // Deliberately empty: undoing this would have to guess which rows it wrote, and the column drop
    // in `1838000000000`'s own down() already takes the values away. Writing a "restore" that set
    // them all back to NULL would be worse than doing nothing — it would look like it undid something.
    //
    // **刻意留空**：回滚它就得猜它写过哪些行，而 `1838000000000` 自己的 down() 里那次 DROP COLUMN 已经
    // 把这些值带走了。写一个「把它们全设回 NULL」的还原，比什么都不做更糟——它会**看起来**像是撤销过。
  }
}
