// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A1 签到防重复：points_entries 加 checkin_date 列 + (user_id, checkin_date) 唯一索引，
 * 唯一约束兜住「检查-插入」竞态下的并发重复签到（sqlite + postgres 双驱动）。
 */
export class AddCheckinDateToPointsEntries1786791000000 implements MigrationInterface {
  name = 'AddCheckinDateToPointsEntries1786791000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "points_entries" ADD "checkin_date" character varying(10)`);
    } else {
      await queryRunner.query(`ALTER TABLE "points_entries" ADD "checkin_date" varchar(10)`);
    }
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2c8f1d6a9b3e5f7a0c1d4e6b8a" ON "points_entries" ("user_id", "checkin_date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_2c8f1d6a9b3e5f7a0c1d4e6b8a"`);
    await queryRunner.query(`ALTER TABLE "points_entries" DROP COLUMN "checkin_date"`);
  }
}
