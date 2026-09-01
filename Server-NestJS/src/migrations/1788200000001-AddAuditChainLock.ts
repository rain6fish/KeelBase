// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DB 级串行锁行（审计哈希链，roadmap §22.10 B）：
 * AuditService / OperationAuditService 在 log() 事务内对 id=1 行 UPDATE（sqlite 写锁）
 * 或 SELECT FOR UPDATE（postgres 行锁），跨实例串行化写链——替代进程内 `_tail`。
 * 手写最小迁移（建表 + seed 锁行 id=1）；sqlite 走 glob 加载，postgres 需加入白名单。
 */
export class AddAuditChainLock1788200000001 implements MigrationInterface {
    name = 'AddAuditChainLock1788200000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const isPg = queryRunner.connection.driver.options.type === 'postgres';
        // touched_at 与实体 AuditChainLock.@UpdateDateColumn 一致（NOT NULL DEFAULT now；postgres 用 TIMESTAMP 无 TZ，匹配 TypeORM 生成），避免迁移一致性漂移
        const touchedDef = isPg ? 'TIMESTAMP NOT NULL DEFAULT now()' : `datetime NOT NULL DEFAULT (datetime('now'))`;
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "audit_chain_lock" (` +
            `id integer PRIMARY KEY NOT NULL, holder varchar(64), touched_at ${touchedDef})`,
        );
        await queryRunner.query(`INSERT INTO "audit_chain_lock" (id, holder) VALUES (1, 'seed')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "audit_chain_lock"`);
    }
}
