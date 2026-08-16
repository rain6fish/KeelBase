import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrgStructures1786706520167 implements MigrationInterface {
    name = 'AddOrgStructures1786706520167'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            // postgres 方言：建 org 四表 + FK + 索引（sqlite 分支通过临时表重建加 FK，postgres 建表时直接带 FK）
            await queryRunner.query(`CREATE TABLE "organizations" ("id" SERIAL NOT NULL, "name" character varying(100) NOT NULL, "description" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_9b7ca6d30b94fef571cff876884" UNIQUE ("name"), CONSTRAINT "PK_organizations" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE TABLE "departments" ("id" SERIAL NOT NULL, "org_id" integer NOT NULL, "name" character varying(100) NOT NULL, "parent_id" integer, "sort_order" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_a186b69fc12fa97ceee66df980e" UNIQUE ("org_id", "name"), CONSTRAINT "PK_departments" PRIMARY KEY ("id"), CONSTRAINT "FK_3cfef557719b71f778c7e8ce7a2" FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_700b0b13f494cb37b6ca929e79b" FOREIGN KEY ("parent_id") REFERENCES "departments" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
            await queryRunner.query(`CREATE INDEX "IDX_366d5b0e34afee3592c00d5c21" ON "departments" ("org_id", "parent_id") `);
            await queryRunner.query(`CREATE TABLE "org_invites" ("id" SERIAL NOT NULL, "code" character varying(12) NOT NULL, "org_id" integer NOT NULL, "inviter_id" integer NOT NULL, "role" character varying(20) NOT NULL DEFAULT 'member', "dept_id" integer, "expires_at" TIMESTAMP, "used_by" integer, "used_at" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_5eeba4156c66039eb92f5169a40" UNIQUE ("code"), CONSTRAINT "PK_org_invites" PRIMARY KEY ("id"), CONSTRAINT "FK_30b0a1cba1b91cf5b2070884a7e" FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_453cbbd741de2129dadc1980a51" FOREIGN KEY ("inviter_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_59d09ced22c5af12e98dcd06c79" FOREIGN KEY ("dept_id") REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`);
            await queryRunner.query(`CREATE INDEX "IDX_30b0a1cba1b91cf5b2070884a7" ON "org_invites" ("org_id") `);
            await queryRunner.query(`CREATE TABLE "org_members" ("id" SERIAL NOT NULL, "org_id" integer NOT NULL, "user_id" integer NOT NULL, "dept_id" integer, "role" character varying(20) NOT NULL DEFAULT 'member', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_986db88b0e82a9189921841199b" UNIQUE ("org_id", "user_id"), CONSTRAINT "PK_org_members" PRIMARY KEY ("id"), CONSTRAINT "FK_a35e7519ef33c0dd4d24bb15056" FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_220d854a7932f6aac9ed84f71c9" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_dac43a101f01434a02d62a10a18" FOREIGN KEY ("dept_id") REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`);
            await queryRunner.query(`CREATE INDEX "IDX_c61e88570c43dfe9834f03879e" ON "org_members" ("org_id", "role") `);
            await queryRunner.query(`CREATE INDEX "IDX_e0470b0bbc75f199ca3f415f44" ON "org_members" ("org_id", "dept_id") `);
            return;
        }
        await queryRunner.query(`CREATE TABLE "organizations" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(100) NOT NULL, "description" varchar(255), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, CONSTRAINT "UQ_9b7ca6d30b94fef571cff876884" UNIQUE ("name"))`);
        await queryRunner.query(`CREATE TABLE "departments" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "org_id" integer NOT NULL, "name" varchar(100) NOT NULL, "parent_id" integer, "sort_order" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, CONSTRAINT "UQ_a186b69fc12fa97ceee66df980e" UNIQUE ("org_id", "name"))`);
        await queryRunner.query(`CREATE INDEX "IDX_366d5b0e34afee3592c00d5c21" ON "departments" ("org_id", "parent_id") `);
        await queryRunner.query(`CREATE TABLE "org_invites" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "code" varchar(12) NOT NULL, "org_id" integer NOT NULL, "inviter_id" integer NOT NULL, "role" varchar(20) NOT NULL DEFAULT ('member'), "dept_id" integer, "expires_at" datetime, "used_by" integer, "used_at" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_5eeba4156c66039eb92f5169a40" UNIQUE ("code"))`);
        await queryRunner.query(`CREATE INDEX "IDX_30b0a1cba1b91cf5b2070884a7" ON "org_invites" ("org_id") `);
        await queryRunner.query(`CREATE TABLE "org_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "org_id" integer NOT NULL, "user_id" integer NOT NULL, "dept_id" integer, "role" varchar(20) NOT NULL DEFAULT ('member'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_986db88b0e82a9189921841199b" UNIQUE ("org_id", "user_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c61e88570c43dfe9834f03879e" ON "org_members" ("org_id", "role") `);
        await queryRunner.query(`CREATE INDEX "IDX_e0470b0bbc75f199ca3f415f44" ON "org_members" ("org_id", "dept_id") `);
        await queryRunner.query(`DROP INDEX "IDX_366d5b0e34afee3592c00d5c21"`);
        await queryRunner.query(`CREATE TABLE "temporary_departments" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "org_id" integer NOT NULL, "name" varchar(100) NOT NULL, "parent_id" integer, "sort_order" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, CONSTRAINT "UQ_a186b69fc12fa97ceee66df980e" UNIQUE ("org_id", "name"), CONSTRAINT "FK_3cfef557719b71f778c7e8ce7a2" FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_700b0b13f494cb37b6ca929e79b" FOREIGN KEY ("parent_id") REFERENCES "departments" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_departments"("id", "org_id", "name", "parent_id", "sort_order", "createdAt", "updatedAt", "deleted_at") SELECT "id", "org_id", "name", "parent_id", "sort_order", "createdAt", "updatedAt", "deleted_at" FROM "departments"`);
        await queryRunner.query(`DROP TABLE "departments"`);
        await queryRunner.query(`ALTER TABLE "temporary_departments" RENAME TO "departments"`);
        await queryRunner.query(`CREATE INDEX "IDX_366d5b0e34afee3592c00d5c21" ON "departments" ("org_id", "parent_id") `);
        await queryRunner.query(`DROP INDEX "IDX_30b0a1cba1b91cf5b2070884a7"`);
        await queryRunner.query(`CREATE TABLE "temporary_org_invites" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "code" varchar(12) NOT NULL, "org_id" integer NOT NULL, "inviter_id" integer NOT NULL, "role" varchar(20) NOT NULL DEFAULT ('member'), "dept_id" integer, "expires_at" datetime, "used_by" integer, "used_at" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_5eeba4156c66039eb92f5169a40" UNIQUE ("code"), CONSTRAINT "FK_30b0a1cba1b91cf5b2070884a7e" FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_453cbbd741de2129dadc1980a51" FOREIGN KEY ("inviter_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_59d09ced22c5af12e98dcd06c79" FOREIGN KEY ("dept_id") REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_org_invites"("id", "code", "org_id", "inviter_id", "role", "dept_id", "expires_at", "used_by", "used_at", "createdAt", "updatedAt") SELECT "id", "code", "org_id", "inviter_id", "role", "dept_id", "expires_at", "used_by", "used_at", "createdAt", "updatedAt" FROM "org_invites"`);
        await queryRunner.query(`DROP TABLE "org_invites"`);
        await queryRunner.query(`ALTER TABLE "temporary_org_invites" RENAME TO "org_invites"`);
        await queryRunner.query(`CREATE INDEX "IDX_30b0a1cba1b91cf5b2070884a7" ON "org_invites" ("org_id") `);
        await queryRunner.query(`DROP INDEX "IDX_c61e88570c43dfe9834f03879e"`);
        await queryRunner.query(`DROP INDEX "IDX_e0470b0bbc75f199ca3f415f44"`);
        await queryRunner.query(`CREATE TABLE "temporary_org_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "org_id" integer NOT NULL, "user_id" integer NOT NULL, "dept_id" integer, "role" varchar(20) NOT NULL DEFAULT ('member'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_986db88b0e82a9189921841199b" UNIQUE ("org_id", "user_id"), CONSTRAINT "FK_a35e7519ef33c0dd4d24bb15056" FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_220d854a7932f6aac9ed84f71c9" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_dac43a101f01434a02d62a10a18" FOREIGN KEY ("dept_id") REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_org_members"("id", "org_id", "user_id", "dept_id", "role", "createdAt", "updatedAt") SELECT "id", "org_id", "user_id", "dept_id", "role", "createdAt", "updatedAt" FROM "org_members"`);
        await queryRunner.query(`DROP TABLE "org_members"`);
        await queryRunner.query(`ALTER TABLE "temporary_org_members" RENAME TO "org_members"`);
        await queryRunner.query(`CREATE INDEX "IDX_c61e88570c43dfe9834f03879e" ON "org_members" ("org_id", "role") `);
        await queryRunner.query(`CREATE INDEX "IDX_e0470b0bbc75f199ca3f415f44" ON "org_members" ("org_id", "dept_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`DROP TABLE "org_members"`);
            await queryRunner.query(`DROP TABLE "org_invites"`);
            await queryRunner.query(`DROP TABLE "departments"`);
            await queryRunner.query(`DROP TABLE "organizations"`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_e0470b0bbc75f199ca3f415f44"`);
        await queryRunner.query(`DROP INDEX "IDX_c61e88570c43dfe9834f03879e"`);
        await queryRunner.query(`ALTER TABLE "org_members" RENAME TO "temporary_org_members"`);
        await queryRunner.query(`CREATE TABLE "org_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "org_id" integer NOT NULL, "user_id" integer NOT NULL, "dept_id" integer, "role" varchar(20) NOT NULL DEFAULT ('member'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_986db88b0e82a9189921841199b" UNIQUE ("org_id", "user_id"))`);
        await queryRunner.query(`INSERT INTO "org_members"("id", "org_id", "user_id", "dept_id", "role", "createdAt", "updatedAt") SELECT "id", "org_id", "user_id", "dept_id", "role", "createdAt", "updatedAt" FROM "temporary_org_members"`);
        await queryRunner.query(`DROP TABLE "temporary_org_members"`);
        await queryRunner.query(`CREATE INDEX "IDX_e0470b0bbc75f199ca3f415f44" ON "org_members" ("org_id", "dept_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_c61e88570c43dfe9834f03879e" ON "org_members" ("org_id", "role") `);
        await queryRunner.query(`DROP INDEX "IDX_30b0a1cba1b91cf5b2070884a7"`);
        await queryRunner.query(`ALTER TABLE "org_invites" RENAME TO "temporary_org_invites"`);
        await queryRunner.query(`CREATE TABLE "org_invites" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "code" varchar(12) NOT NULL, "org_id" integer NOT NULL, "inviter_id" integer NOT NULL, "role" varchar(20) NOT NULL DEFAULT ('member'), "dept_id" integer, "expires_at" datetime, "used_by" integer, "used_at" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_5eeba4156c66039eb92f5169a40" UNIQUE ("code"))`);
        await queryRunner.query(`INSERT INTO "org_invites"("id", "code", "org_id", "inviter_id", "role", "dept_id", "expires_at", "used_by", "used_at", "createdAt", "updatedAt") SELECT "id", "code", "org_id", "inviter_id", "role", "dept_id", "expires_at", "used_by", "used_at", "createdAt", "updatedAt" FROM "temporary_org_invites"`);
        await queryRunner.query(`DROP TABLE "temporary_org_invites"`);
        await queryRunner.query(`CREATE INDEX "IDX_30b0a1cba1b91cf5b2070884a7" ON "org_invites" ("org_id") `);
        await queryRunner.query(`DROP INDEX "IDX_366d5b0e34afee3592c00d5c21"`);
        await queryRunner.query(`ALTER TABLE "departments" RENAME TO "temporary_departments"`);
        await queryRunner.query(`CREATE TABLE "departments" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "org_id" integer NOT NULL, "name" varchar(100) NOT NULL, "parent_id" integer, "sort_order" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, CONSTRAINT "UQ_a186b69fc12fa97ceee66df980e" UNIQUE ("org_id", "name"))`);
        await queryRunner.query(`INSERT INTO "departments"("id", "org_id", "name", "parent_id", "sort_order", "createdAt", "updatedAt", "deleted_at") SELECT "id", "org_id", "name", "parent_id", "sort_order", "createdAt", "updatedAt", "deleted_at" FROM "temporary_departments"`);
        await queryRunner.query(`DROP TABLE "temporary_departments"`);
        await queryRunner.query(`CREATE INDEX "IDX_366d5b0e34afee3592c00d5c21" ON "departments" ("org_id", "parent_id") `);
        await queryRunner.query(`DROP INDEX "IDX_e0470b0bbc75f199ca3f415f44"`);
        await queryRunner.query(`DROP INDEX "IDX_c61e88570c43dfe9834f03879e"`);
        await queryRunner.query(`DROP TABLE "org_members"`);
        await queryRunner.query(`DROP INDEX "IDX_30b0a1cba1b91cf5b2070884a7"`);
        await queryRunner.query(`DROP TABLE "org_invites"`);
        await queryRunner.query(`DROP INDEX "IDX_366d5b0e34afee3592c00d5c21"`);
        await queryRunner.query(`DROP TABLE "departments"`);
        await queryRunner.query(`DROP TABLE "organizations"`);
    }

}
