import { MigrationInterface, QueryRunner } from 'typeorm';

/** GROWTH-2 社区动态流：post_likes / post_comments / user_follows 表（sqlite + postgres 双驱动）。 */
export class AddGrowthCommunity1786706697810 implements MigrationInterface {
  name = 'AddGrowthCommunity1786706697810';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`CREATE TABLE "post_likes" ("id" SERIAL NOT NULL, "post_id" integer NOT NULL, "user_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_post_likes_post_user" UNIQUE ("post_id", "user_id"), CONSTRAINT "PK_post_likes" PRIMARY KEY ("id"))`);
      await queryRunner.query(`CREATE TABLE "post_comments" ("id" SERIAL NOT NULL, "post_id" integer NOT NULL, "user_id" integer NOT NULL, "content" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_post_comments" PRIMARY KEY ("id"))`);
      await queryRunner.query(`CREATE INDEX "IDX_post_comments_post" ON "post_comments" ("post_id", "created_at") `);
      await queryRunner.query(`CREATE TABLE "user_follows" ("id" SERIAL NOT NULL, "follower_id" integer NOT NULL, "followee_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_user_follows_pair" UNIQUE ("follower_id", "followee_id"), CONSTRAINT "PK_user_follows" PRIMARY KEY ("id"))`);
      return;
    }
    await queryRunner.query(`CREATE TABLE "post_likes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "post_id" integer NOT NULL, "user_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_post_likes_post_user" UNIQUE ("post_id", "user_id"))`);
    await queryRunner.query(`CREATE TABLE "post_comments" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "post_id" integer NOT NULL, "user_id" integer NOT NULL, "content" text NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE INDEX "IDX_post_comments_post" ON "post_comments" ("post_id", "created_at") `);
    await queryRunner.query(`CREATE TABLE "user_follows" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "follower_id" integer NOT NULL, "followee_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_user_follows_pair" UNIQUE ("follower_id", "followee_id"))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_follows"`);
    await queryRunner.query(`DROP TABLE "post_comments"`);
    await queryRunner.query(`DROP TABLE "post_likes"`);
  }
}
