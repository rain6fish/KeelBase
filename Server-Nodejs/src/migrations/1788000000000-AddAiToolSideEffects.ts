import { MigrationInterface, QueryRunner } from 'typeorm';

/** HS-3 建 ai_tool_side_effects 表（sqlite + postgres 双驱动）。列名下划线，与 TypeORM 默认映射一致。 */
export class AddAiToolSideEffects1788000000000 implements MigrationInterface {
  name = 'AddAiToolSideEffects1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`CREATE TABLE "ai_tool_side_effects" ("id" SERIAL NOT NULL, "idempotency_key" character varying(64) NOT NULL, "user_id" character varying NOT NULL, "conversation_id" character varying, "tool_name" character varying(64) NOT NULL, "args_hash" character varying(64) NOT NULL, "result_type" character varying(16) NOT NULL, "result_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"), CONSTRAINT "PK_ai_tool_side_effects" PRIMARY KEY ("id"))`);
      return;
    }
    await queryRunner.query(`CREATE TABLE "ai_tool_side_effects" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "idempotency_key" varchar(64) NOT NULL, "user_id" varchar NOT NULL, "conversation_id" varchar, "tool_name" varchar(64) NOT NULL, "args_hash" varchar(64) NOT NULL, "result_type" varchar(16) NOT NULL, "result_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_tool_side_effects"`);
  }
}
