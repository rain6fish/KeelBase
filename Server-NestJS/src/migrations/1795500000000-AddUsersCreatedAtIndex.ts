import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E-3 性能：users.createdAt 加索引（管理台用户列表按 createdAt 排序/趋势聚合的支撑）。
 * 可读索引名（IDX_users_created_at）与实体 @Index 双侧一致，避免 TypeORM 生成 hash 名漂移。
 * users.createdAt 列名为 camelCase "createdAt"（无 name 映射，PostgresInitialSchema 同）。
 */
export class AddUsersCreatedAtIndex1795500000000 implements MigrationInterface {
  name = 'AddUsersCreatedAtIndex1795500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`CREATE INDEX "IDX_users_created_at" ON "users" ("createdAt")`);
      return;
    }
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_created_at" ON "users" ("createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`DROP INDEX "IDX_users_created_at"`);
      return;
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_created_at"`);
  }
}
