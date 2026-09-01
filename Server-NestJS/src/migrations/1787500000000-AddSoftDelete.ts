// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/** RG-3 软删除：events / todos 加 deleted_at 列（sqlite + postgres 双驱动）。 */
export class AddSoftDelete1787500000000 implements MigrationInterface {
  name = 'AddSoftDelete1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "events" ADD "deleted_at" TIMESTAMP`);
      await queryRunner.query(`ALTER TABLE "todos" ADD "deleted_at" TIMESTAMP`);
      return;
    }
    await queryRunner.query(`ALTER TABLE "events" ADD "deleted_at" datetime`);
    await queryRunner.query(`ALTER TABLE "todos" ADD "deleted_at" datetime`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "deleted_at"`);
      await queryRunner.query(`ALTER TABLE "todos" DROP COLUMN "deleted_at"`);
      return;
    }
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "todos" DROP COLUMN "deleted_at"`);
  }
}
