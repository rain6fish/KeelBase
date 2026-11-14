// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 0-B retention: the full tool-result bodies behind `ai_audit_logs` `tool_call` rows.
 *
 * New table only. A separate table cannot enter the audit chain payload, so nothing here can break an
 * existing chain; the audit row's width does not grow either. `audit_row_id` is unique, which makes
 * the writer idempotent on retries and gives a body exactly one anchor.
 *
 * 0-B 留存：`ai_audit_logs` 的 `tool_call` 行背后的完整工具结果正文。
 *
 * 只建新表。独立表进不了审计链 payload，故这里不会弄坏任何既有链；审计行行宽也不增长。
 * `audit_row_id` 唯一，写入因此在重试下幂等，且一份正文恰有一个锚。
 */
export class AddAiToolResultBodies1850000000000 implements MigrationInterface {
  name = 'AddAiToolResultBodies1850000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const q = (sql: string) => queryRunner.query(sql);

    if (isPg) {
      await q(
        `CREATE TABLE "ai_tool_result_bodies" ("id" SERIAL NOT NULL, "audit_row_id" integer NOT NULL, "conversation_id" character varying(64), "user_id" character varying(64) NOT NULL, "tool_name" character varying(64) NOT NULL, "outcome" character varying(16) NOT NULL, "body_state" character varying(16) NOT NULL, "body_text" text, "body_bytes" integer NOT NULL, "stored_bytes" integer, "body_sha256" character varying(64), "original_sha256" character varying(64), "model_text" text, "model_chars" integer, "model_sha256" character varying(64), "was_truncated" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "expires_at" TIMESTAMP NOT NULL, CONSTRAINT "PK_87ea5dfc8b8e384d848979496e7" PRIMARY KEY ("id"))`,
      );
    } else {
      await q(
        `CREATE TABLE "ai_tool_result_bodies" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "audit_row_id" integer NOT NULL, "conversation_id" varchar(64), "user_id" varchar(64) NOT NULL, "tool_name" varchar(64) NOT NULL, "outcome" varchar(16) NOT NULL, "body_state" varchar(16) NOT NULL, "body_text" text, "body_bytes" integer NOT NULL, "stored_bytes" integer, "body_sha256" varchar(64), "original_sha256" varchar(64), "model_text" text, "model_chars" integer, "model_sha256" varchar(64), "was_truncated" boolean NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "expires_at" datetime NOT NULL)`,
      );
    }
    await q(
      `CREATE UNIQUE INDEX "IDX_2aa4dd30c54e0660f4e3c47401" ON "ai_tool_result_bodies" ("audit_row_id") `,
    );
    await q(
      `CREATE INDEX "IDX_9512d888245d4c2cefe99271dc" ON "ai_tool_result_bodies" ("conversation_id") `,
    );
    await q(
      `CREATE INDEX "IDX_0c0e5dc511ee5c97f1b77cd8e2" ON "ai_tool_result_bodies" ("expires_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`DROP INDEX "IDX_0c0e5dc511ee5c97f1b77cd8e2"`);
    await q(`DROP INDEX "IDX_9512d888245d4c2cefe99271dc"`);
    await q(`DROP INDEX "IDX_2aa4dd30c54e0660f4e3c47401"`);
    await q(`DROP TABLE "ai_tool_result_bodies"`);
  }
}
