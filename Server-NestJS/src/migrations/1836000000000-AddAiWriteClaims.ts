// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ACT-5/6 slice 1: the row that exists **before** a local write runs, so "is this call already being
 * executed" has an answer that does not depend on the write having finished.
 *
 * `findExisting → execute → record` is check-then-act: two concurrent requests both read "nothing yet"
 * and both write to the target. The unique key on `ai_tool_side_effects` then keeps the ledger to one
 * row — which is exactly the point. It protects the **ledger**, not the **action**.
 *
 * The key is the existing idempotency key, not a new identity: it already names the logical call
 * (`userId:conversationId:toolName:sortKeys(args)`) and is computable before execution, so its unique
 * constraint is the arbitration point — whoever inserts first owns the execution.
 *
 * Separate table on purpose. `ai_tool_side_effects` means "a recorded effect", and "the set of rows
 * equals the set of the action's members" is the projection assumption this project tracks as its own
 * biggest risk (RISK-B, roadmap §2.1.12). Putting not-yet-settled rows there would weaken that
 * assumption directly.
 *
 * **Scope of this slice: local entity writes only.** Proxy and external MCP writes are the "the target
 * may or may not have received it" class, whose failure policy is still open (roadmap §2.1.16
 * reconnaissance ②), and are untouched here.
 *
 * DDL and constraint/index names come from `migration:generate` against a fresh migrated database (so
 * the entity↔migration parity gate sees no drift); the postgres branch is the same DDL in that dialect,
 * with the names TypeORM's naming strategy derives (verified against four generated samples already in
 * this repository). Timestamp 1836000000000 is later than the newest existing migration 1835000000000.
 *
 * ACT-5/6 切片 1：**本地写执行之前**就存在的那一行，使「这次调用是否已在执行」有一个不依赖「写已完成」
 * 的答案。
 *
 * `findExisting → execute → record` 是 check-then-act：两份并发请求都读到「还没有」，于是都往目标写。
 * `ai_tool_side_effects` 的唯一键随后把账本收成一行 —— 这恰恰是问题所在：它保护的是**账**，不是**动作**。
 *
 * 键用既有的幂等键，不新造身份：它本就命名了那次逻辑调用（`userId:conversationId:toolName:sortKeys(args)`）
 * 且执行前可算，故其唯一约束就是仲裁点 —— 先插进去的那个人拥有这次执行。
 *
 * 单独一张表是有意的。`ai_tool_side_effects` 的含义是「已记录的副作用」，而「行集合 = 业务动作成员集合」
 * 正是本项目自己跟踪的最大风险（RISK-B，roadmap §2.1.12）。把未落定的行放进去会**直接削弱**那条假设。
 *
 * **本切片范围：仅本地实体写。** 代理写与外部 MCP 写属「目标系统是否收到不可知」那一类，其失败政策仍
 * 未决（roadmap §2.1.16 侦察结论 ②），此处不动。
 *
 * DDL 与约束/索引名取自**对全新已迁移库跑 `migration:generate`** 的结果（使实体↔迁移 parity 门看不到漂移）；
 * postgres 分支是同一 DDL 的该方言写法，名字用 TypeORM 命名策略推导（已用本仓四个既有生成样本验证）。
 * 时间戳 1836000000000 晚于最新既有迁移 1835000000000。
 */
export class AddAiWriteClaims1836000000000 implements MigrationInterface {
  name = 'AddAiWriteClaims1836000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const q = (sql: string) => queryRunner.query(sql);

    if (isPg) {
      await q(
        `CREATE TABLE "ai_write_claims" ("id" SERIAL NOT NULL, "idempotency_key" character varying(64) NOT NULL, "user_id" character varying NOT NULL, "conversation_id" character varying, "run_id" character varying(64), "tool_name" character varying(64) NOT NULL, "args_hash" character varying(64) NOT NULL, "agent_id" character varying(64), "status" character varying(16) NOT NULL, "claimed_at" TIMESTAMP NOT NULL, "settled_at" TIMESTAMP, "effect_id" integer, "release_reason" character varying(32), "attempts" integer NOT NULL DEFAULT 1, CONSTRAINT "UQ_e322488983b0d24d9078227d85e" UNIQUE ("idempotency_key"), CONSTRAINT "PK_d27fb1a4177c62fe408df4c176e" PRIMARY KEY ("id"))`,
      );
    } else {
      await q(
        `CREATE TABLE "ai_write_claims" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "idempotency_key" varchar(64) NOT NULL, "user_id" varchar NOT NULL, "conversation_id" varchar, "run_id" varchar(64), "tool_name" varchar(64) NOT NULL, "args_hash" varchar(64) NOT NULL, "agent_id" varchar(64), "status" varchar(16) NOT NULL, "claimed_at" datetime NOT NULL, "settled_at" datetime, "effect_id" integer, "release_reason" varchar(32), "attempts" integer NOT NULL DEFAULT (1), CONSTRAINT "UQ_e322488983b0d24d9078227d85e" UNIQUE ("idempotency_key"))`,
      );
    }
    await q(`CREATE INDEX "IDX_86b0dbdf0829b8323a38ef6f4e" ON "ai_write_claims" ("conversation_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`DROP INDEX "IDX_86b0dbdf0829b8323a38ef6f4e"`);
    await q(`DROP TABLE "ai_write_claims"`);
  }
}
