// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/** ORG-3 二期组织级数据隔离：todos 加 org_id 列（sqlite + postgres 双驱动）。 */
export class AddTodoOrgId1786788683813 implements MigrationInterface {
  name = 'AddTodoOrgId1786788683813';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "todos" ADD "org_id" integer`);
      return;
    }
    await queryRunner.query(`ALTER TABLE "todos" ADD "org_id" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "todos" DROP COLUMN "org_id"`);
  }
}
