import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmailVerification1785898133089 implements MigrationInterface {
    name = 'AddEmailVerification1785898133089'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "temporary_users" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" varchar(32) NOT NULL, "email" varchar(255) NOT NULL, "password" varchar(255) NOT NULL, "firstName" varchar(64), "lastName" varchar(64), "nickname" varchar(64) NOT NULL, "phone" varchar(512), "dateOfBirth" date, "bio" varchar(512), "avatarUrl" varchar(256), "role" varchar(16) NOT NULL DEFAULT ('user'), "provider" varchar(32), "provider_id" varchar(512), "provider_hash" varchar(64), "refresh_token_hash" varchar(512), "login_attempts" integer NOT NULL DEFAULT (0), "locked_until" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "reset_token_hash" varchar(64), "reset_token_expires_at" datetime, "email_verified" boolean NOT NULL DEFAULT (0), "email_verification_code" varchar(64), "email_verification_expires_at" datetime, CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"))`);
        await queryRunner.query(`INSERT INTO "temporary_users"("id", "username", "email", "password", "firstName", "lastName", "nickname", "phone", "dateOfBirth", "bio", "avatarUrl", "role", "provider", "provider_id", "provider_hash", "refresh_token_hash", "login_attempts", "locked_until", "createdAt", "updatedAt", "reset_token_hash", "reset_token_expires_at") SELECT "id", "username", "email", "password", "firstName", "lastName", "nickname", "phone", "dateOfBirth", "bio", "avatarUrl", "role", "provider", "provider_id", "provider_hash", "refresh_token_hash", "login_attempts", "locked_until", "createdAt", "updatedAt", "reset_token_hash", "reset_token_expires_at" FROM "users"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`ALTER TABLE "temporary_users" RENAME TO "users"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" RENAME TO "temporary_users"`);
        await queryRunner.query(`CREATE TABLE "users" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" varchar(32) NOT NULL, "email" varchar(255) NOT NULL, "password" varchar(255) NOT NULL, "firstName" varchar(64), "lastName" varchar(64), "nickname" varchar(64) NOT NULL, "phone" varchar(512), "dateOfBirth" date, "bio" varchar(512), "avatarUrl" varchar(256), "role" varchar(16) NOT NULL DEFAULT ('user'), "provider" varchar(32), "provider_id" varchar(512), "provider_hash" varchar(64), "refresh_token_hash" varchar(512), "login_attempts" integer NOT NULL DEFAULT (0), "locked_until" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "reset_token_hash" varchar(64), "reset_token_expires_at" datetime, CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"))`);
        await queryRunner.query(`INSERT INTO "users"("id", "username", "email", "password", "firstName", "lastName", "nickname", "phone", "dateOfBirth", "bio", "avatarUrl", "role", "provider", "provider_id", "provider_hash", "refresh_token_hash", "login_attempts", "locked_until", "createdAt", "updatedAt", "reset_token_hash", "reset_token_expires_at") SELECT "id", "username", "email", "password", "firstName", "lastName", "nickname", "phone", "dateOfBirth", "bio", "avatarUrl", "role", "provider", "provider_id", "provider_hash", "refresh_token_hash", "login_attempts", "locked_until", "createdAt", "updatedAt", "reset_token_hash", "reset_token_expires_at" FROM "temporary_users"`);
        await queryRunner.query(`DROP TABLE "temporary_users"`);
    }

}
