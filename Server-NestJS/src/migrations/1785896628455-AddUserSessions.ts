// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserSessions1785896628455 implements MigrationInterface {
    name = 'AddUserSessions1785896628455'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_sessions" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "refresh_hash" varchar(64) NOT NULL, "device_id" varchar(64), "device_name" varchar(128), "user_agent" varchar(255), "ip" varchar(64), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "last_active_at" datetime, "expires_at" datetime)`);
        await queryRunner.query(`CREATE INDEX "IDX_e9658e959c490b0a634dfc5478" ON "user_sessions" ("user_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_e9658e959c490b0a634dfc5478"`);
        await queryRunner.query(`DROP TABLE "user_sessions"`);
    }

}
