// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ACT-5: the execution identity — one row per attempt to run a write tool, fixed **before** the tool
 * runs, so the idempotency key becomes a gate instead of a probe.
 *
 * Until now `executeWrite` was `check → execute → record`: concurrent calls with the same arguments
 * each missed the probe and each executed, and a retry after a crash re-executed a write that may
 * already have landed (`docs/failure-path-corpus.spec.md` FP-10). The unique key guarded the ledger,
 * not the action. The new row is written first, and its unique `idempotency_key` is the same value
 * `AiToolEffectsService.buildKey` already produces.
 *
 * **No backfill**: rows predating this table have no execution identity and none can be invented for
 * them — their effects keep the conservative "attribute only when it is unambiguous" rule.
 *
 * Both dialects are plain `CREATE TABLE` in one file, postgres first (its types differ: `SERIAL`,
 * `character varying(n)`, `TIMESTAMP … DEFAULT now()`). Timestamp 1836100000000 is later than the
 * newest existing migrations 1836000000001.
 *
 * **Why not 1836000000000**: another line of work had already taken `1836000000000-AddAiWriteClaims` on
 * main (a migration for a different table). Both could coexist, but a shared timestamp leaves the
 * execution order undetermined, against the point of the "later than the newest" rule. This one
 * yields to 1836100000000 — which of them merges second does not matter.
 *
 * ACT-5：执行身份 —— 一次写工具的执行尝试一行，在工具跑起来**之前**落定，于是幂等键从「探测」变成闸门。
 *
 * 此前 `executeWrite` 是 `check → execute → record`：并发同参数调用各miss探测、各执行一次，崩溃后的重试
 * 会把可能已落地的写再执行一次（`docs/failure-path-corpus.spec.md` FP-10）。唯一键护的是账、不是动作。
 * 新行先写，其唯一的 `idempotency_key` 就是 `buildKey` 早已产出的那个值。
 *
 * **不回填**：本表之前的行没有执行身份，也无法为它们发明一个 —— 那些副作用继续走保守的「只在无歧义时
 * 归因」规则。
 *
 * 双方言都在一个文件里用普通 `CREATE TABLE`，postgres 在前（类型不同：`SERIAL`、`character varying(n)`、
 * `TIMESTAMP … DEFAULT now()`）。时间戳 1836100000000 晚于最新既有迁移 1836000000001。
 *
 * **为什么不是 1836000000000**：另一条工作线已在 main 上占了 `1836000000000-AddAiWriteClaims`（另一张表的迁移）。
 * 两者其实能并存，但**同时间戳会让执行顺序不确定**，违背「时间戳晚于当前最新」那条约定的本意。
 * 故本条让位到 1836100000000——**谁后合并不重要**。
 */
export class AddAiToolExecutions1836100000000 implements MigrationInterface {
  name = 'AddAiToolExecutions1836100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(
        `CREATE TABLE "ai_tool_executions" (` +
          `"id" SERIAL NOT NULL, ` +
          `"idempotency_key" character varying(64) NOT NULL, ` +
          `"user_id" character varying NOT NULL, ` +
          `"conversation_id" character varying(64), ` +
          `"run_id" character varying(64), ` +
          `"tool_name" character varying(64) NOT NULL, ` +
          `"destination" character varying(64), ` +
          `"authorization_ref" character varying(64), ` +
          `"agent_id" character varying(64), ` +
          `"audit_row_id" integer, ` +
          `"settled_at" TIMESTAMP, ` +
          `"error" text, ` +
          `"created_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
          `CONSTRAINT "UQ_ai_tool_executions_key" UNIQUE ("idempotency_key"), ` +
          `CONSTRAINT "PK_ai_tool_executions" PRIMARY KEY ("id"))`,
      );
      return;
    }
    await queryRunner.query(
      `CREATE TABLE "ai_tool_executions" (` +
        `"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ` +
        `"idempotency_key" varchar(64) NOT NULL, ` +
        `"user_id" varchar NOT NULL, ` +
        `"conversation_id" varchar(64), ` +
        `"run_id" varchar(64), ` +
        `"tool_name" varchar(64) NOT NULL, ` +
        `"destination" varchar(64), ` +
        `"authorization_ref" varchar(64), ` +
        `"agent_id" varchar(64), ` +
        `"audit_row_id" integer, ` +
        `"settled_at" datetime, ` +
        `"error" text, ` +
        `"created_at" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `CONSTRAINT "UQ_ai_tool_executions_key" UNIQUE ("idempotency_key"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`DROP TABLE "public"."ai_tool_executions"`);
      return;
    }
    await queryRunner.query(`DROP TABLE "ai_tool_executions"`);
  }
}
