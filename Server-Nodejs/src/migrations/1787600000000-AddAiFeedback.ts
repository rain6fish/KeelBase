import { MigrationInterface, QueryRunner } from 'typeorm';

/** AI-18 对话反馈：ai_audit_logs 加 feedback / feedback_note 列（sqlite + postgres 双驱动）。 */
export class AddAiFeedback1787600000000 implements MigrationInterface {
  name = 'AddAiFeedback1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD "feedback" character varying(16)`);
      await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD "feedback_note" text`);
      return;
    }
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD "feedback" varchar(16)`);
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD "feedback_note" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "feedback_note"`);
      await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "feedback"`);
      return;
    }
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "feedback_note"`);
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "feedback"`);
  }
}
