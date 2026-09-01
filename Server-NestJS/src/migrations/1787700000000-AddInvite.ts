// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/** G-2 邀请奖励：users 加 invite_code / invited_by 列（sqlite + postgres 双驱动）。 */
export class AddInvite1787700000000 implements MigrationInterface {
  name = 'AddInvite1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "users" ADD "invite_code" character varying(12)`);
      await queryRunner.query(`ALTER TABLE "users" ADD "invited_by" integer`);
      await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_invite_code" ON "users" ("invite_code")`);
      return;
    }
    await queryRunner.query(`ALTER TABLE "users" ADD "invite_code" varchar(12)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "invited_by" integer`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_invite_code" ON "users" ("invite_code")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`DROP INDEX "IDX_users_invite_code"`);
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "invited_by"`);
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "invite_code"`);
      return;
    }
    await queryRunner.query(`DROP INDEX "IDX_users_invite_code"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "invited_by"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "invite_code"`);
  }
}
