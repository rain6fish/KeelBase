// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/** ORG-3 组织级数据隔离：events 加 org_id 列（sqlite + postgres 双驱动）。 */
export class AddEventOrgId1786752837396 implements MigrationInterface {
  name = 'AddEventOrgId1786752837396';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "events" ADD "org_id" integer`);
      return;
    }
    await queryRunner.query(`ALTER TABLE "events" ADD "org_id" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "org_id"`);
  }
}
