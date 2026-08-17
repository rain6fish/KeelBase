import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * AI Project Management 旗舰应用：pm_projects / pm_members / pm_milestones / pm_tasks / pm_risks 表。
 * 双驱动：postgres（SERIAL + 内联 FK）先建并 return；sqlite（AUTOINCREMENT + 临时表重建补 FK）。
 * 索引/FK 约束名取自 migration:generate 输出（TypeORM hash 名，避免一致性漂移）。
 */
export class AddPm1786970864048 implements MigrationInterface {
    name = 'AddPm1786970864048'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if ((queryRunner.connection.options as any).type === 'postgres') {
            await queryRunner.query(`CREATE TABLE "pm_projects" ("id" SERIAL NOT NULL, "name" character varying(200) NOT NULL, "description" text, "status" character varying(16) NOT NULL DEFAULT 'planned', "riskLevel" character varying(16) NOT NULL DEFAULT 'low', "startDate" TIMESTAMP, "endDate" TIMESTAMP, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_1c7b5952cdb6bddb94dffd6bd15" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_d67f2318b32f65bbbf32e55207" ON "pm_projects" ("status") `);
            await queryRunner.query(`CREATE INDEX "IDX_9573db5e752a122c295abeb5da" ON "pm_projects" ("user_id") `);
            await queryRunner.query(`CREATE TABLE "pm_members" ("id" SERIAL NOT NULL, "project_id" integer NOT NULL, "user_id" integer NOT NULL, "role" character varying(16) NOT NULL DEFAULT 'member', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ab60ec19a3a58cc00125bd55f99" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_db5ceaaa8d8012006478fb24de" ON "pm_members" ("user_id") `);
            await queryRunner.query(`CREATE INDEX "IDX_b4bc2a68d75821167894fb2749" ON "pm_members" ("project_id") `);
            await queryRunner.query(`CREATE TABLE "pm_milestones" ("id" SERIAL NOT NULL, "project_id" integer NOT NULL, "title" character varying(200) NOT NULL, "dueDate" TIMESTAMP, "status" character varying(16) NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_609c78c5dd1fcf160448e61265a" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_3b61033ae23e7d3cb0c3ced2de" ON "pm_milestones" ("project_id") `);
            await queryRunner.query(`CREATE TABLE "pm_risks" ("id" SERIAL NOT NULL, "project_id" integer NOT NULL, "level" character varying(16) NOT NULL DEFAULT 'medium', "reason" text NOT NULL, "detectedAt" TIMESTAMP NOT NULL, "resolvedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f737461839c7487fbfba796823d" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_31a99f9de3f948d70839cedb20" ON "pm_risks" ("project_id") `);
            await queryRunner.query(`CREATE TABLE "pm_tasks" ("id" SERIAL NOT NULL, "project_id" integer NOT NULL, "title" character varying(200) NOT NULL, "description" text, "dueDate" TIMESTAMP, "status" character varying(16) NOT NULL DEFAULT 'pending', "assignee_id" integer, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_7d7647ce639affc051bb665d58c" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_84117be4ac9bf5b251ba236a2c" ON "pm_tasks" ("user_id") `);
            await queryRunner.query(`CREATE INDEX "IDX_0c0aa1e82560a8ccb0983eaf6a" ON "pm_tasks" ("project_id") `);
            await queryRunner.query(`ALTER TABLE "pm_members" ADD CONSTRAINT "FK_b4bc2a68d75821167894fb27492" FOREIGN KEY ("project_id") REFERENCES "pm_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
            await queryRunner.query(`ALTER TABLE "pm_milestones" ADD CONSTRAINT "FK_3b61033ae23e7d3cb0c3ced2de2" FOREIGN KEY ("project_id") REFERENCES "pm_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
            await queryRunner.query(`ALTER TABLE "pm_risks" ADD CONSTRAINT "FK_31a99f9de3f948d70839cedb20d" FOREIGN KEY ("project_id") REFERENCES "pm_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
            await queryRunner.query(`ALTER TABLE "pm_tasks" ADD CONSTRAINT "FK_0c0aa1e82560a8ccb0983eaf6a7" FOREIGN KEY ("project_id") REFERENCES "pm_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
            return;
        }

        await queryRunner.query(`CREATE TABLE "pm_projects" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(200) NOT NULL, "description" text, "status" varchar(16) NOT NULL DEFAULT ('planned'), "riskLevel" varchar(16) NOT NULL DEFAULT ('low'), "startDate" datetime, "endDate" datetime, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
        await queryRunner.query(`CREATE INDEX "IDX_d67f2318b32f65bbbf32e55207" ON "pm_projects" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_9573db5e752a122c295abeb5da" ON "pm_projects" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "pm_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "project_id" integer NOT NULL, "user_id" integer NOT NULL, "role" varchar(16) NOT NULL DEFAULT ('member'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_db5ceaaa8d8012006478fb24de" ON "pm_members" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_b4bc2a68d75821167894fb2749" ON "pm_members" ("project_id") `);
        await queryRunner.query(`CREATE TABLE "pm_milestones" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "project_id" integer NOT NULL, "title" varchar(200) NOT NULL, "dueDate" datetime, "status" varchar(16) NOT NULL DEFAULT ('pending'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_3b61033ae23e7d3cb0c3ced2de" ON "pm_milestones" ("project_id") `);
        await queryRunner.query(`CREATE TABLE "pm_risks" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "project_id" integer NOT NULL, "level" varchar(16) NOT NULL DEFAULT ('medium'), "reason" text NOT NULL, "detectedAt" datetime NOT NULL, "resolvedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_31a99f9de3f948d70839cedb20" ON "pm_risks" ("project_id") `);
        await queryRunner.query(`CREATE TABLE "pm_tasks" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "project_id" integer NOT NULL, "title" varchar(200) NOT NULL, "description" text, "dueDate" datetime, "status" varchar(16) NOT NULL DEFAULT ('pending'), "assignee_id" integer, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
        await queryRunner.query(`CREATE INDEX "IDX_84117be4ac9bf5b251ba236a2c" ON "pm_tasks" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_0c0aa1e82560a8ccb0983eaf6a" ON "pm_tasks" ("project_id") `);
        await queryRunner.query(`DROP INDEX "IDX_db5ceaaa8d8012006478fb24de"`);
        await queryRunner.query(`DROP INDEX "IDX_b4bc2a68d75821167894fb2749"`);
        await queryRunner.query(`CREATE TABLE "temporary_pm_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "project_id" integer NOT NULL, "user_id" integer NOT NULL, "role" varchar(16) NOT NULL DEFAULT ('member'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_b4bc2a68d75821167894fb27492" FOREIGN KEY ("project_id") REFERENCES "pm_projects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_pm_members"("id", "project_id", "user_id", "role", "createdAt", "updatedAt") SELECT "id", "project_id", "user_id", "role", "createdAt", "updatedAt" FROM "pm_members"`);
        await queryRunner.query(`DROP TABLE "pm_members"`);
        await queryRunner.query(`ALTER TABLE "temporary_pm_members" RENAME TO "pm_members"`);
        await queryRunner.query(`CREATE INDEX "IDX_db5ceaaa8d8012006478fb24de" ON "pm_members" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_b4bc2a68d75821167894fb2749" ON "pm_members" ("project_id") `);
        await queryRunner.query(`DROP INDEX "IDX_3b61033ae23e7d3cb0c3ced2de"`);
        await queryRunner.query(`CREATE TABLE "temporary_pm_milestones" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "project_id" integer NOT NULL, "title" varchar(200) NOT NULL, "dueDate" datetime, "status" varchar(16) NOT NULL DEFAULT ('pending'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_3b61033ae23e7d3cb0c3ced2de2" FOREIGN KEY ("project_id") REFERENCES "pm_projects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_pm_milestones"("id", "project_id", "title", "dueDate", "status", "createdAt", "updatedAt") SELECT "id", "project_id", "title", "dueDate", "status", "createdAt", "updatedAt" FROM "pm_milestones"`);
        await queryRunner.query(`DROP TABLE "pm_milestones"`);
        await queryRunner.query(`ALTER TABLE "temporary_pm_milestones" RENAME TO "pm_milestones"`);
        await queryRunner.query(`CREATE INDEX "IDX_3b61033ae23e7d3cb0c3ced2de" ON "pm_milestones" ("project_id") `);
        await queryRunner.query(`DROP INDEX "IDX_31a99f9de3f948d70839cedb20"`);
        await queryRunner.query(`CREATE TABLE "temporary_pm_risks" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "project_id" integer NOT NULL, "level" varchar(16) NOT NULL DEFAULT ('medium'), "reason" text NOT NULL, "detectedAt" datetime NOT NULL, "resolvedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_31a99f9de3f948d70839cedb20d" FOREIGN KEY ("project_id") REFERENCES "pm_projects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_pm_risks"("id", "project_id", "level", "reason", "detectedAt", "resolvedAt", "createdAt", "updatedAt") SELECT "id", "project_id", "level", "reason", "detectedAt", "resolvedAt", "createdAt", "updatedAt" FROM "pm_risks"`);
        await queryRunner.query(`DROP TABLE "pm_risks"`);
        await queryRunner.query(`ALTER TABLE "temporary_pm_risks" RENAME TO "pm_risks"`);
        await queryRunner.query(`CREATE INDEX "IDX_31a99f9de3f948d70839cedb20" ON "pm_risks" ("project_id") `);
        await queryRunner.query(`DROP INDEX "IDX_84117be4ac9bf5b251ba236a2c"`);
        await queryRunner.query(`DROP INDEX "IDX_0c0aa1e82560a8ccb0983eaf6a"`);
        await queryRunner.query(`CREATE TABLE "temporary_pm_tasks" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "project_id" integer NOT NULL, "title" varchar(200) NOT NULL, "description" text, "dueDate" datetime, "status" varchar(16) NOT NULL DEFAULT ('pending'), "assignee_id" integer, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, CONSTRAINT "FK_0c0aa1e82560a8ccb0983eaf6a7" FOREIGN KEY ("project_id") REFERENCES "pm_projects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_pm_tasks"("id", "project_id", "title", "description", "dueDate", "status", "assignee_id", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "project_id", "title", "description", "dueDate", "status", "assignee_id", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "pm_tasks"`);
        await queryRunner.query(`DROP TABLE "pm_tasks"`);
        await queryRunner.query(`ALTER TABLE "temporary_pm_tasks" RENAME TO "pm_tasks"`);
        await queryRunner.query(`CREATE INDEX "IDX_84117be4ac9bf5b251ba236a2c" ON "pm_tasks" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_0c0aa1e82560a8ccb0983eaf6a" ON "pm_tasks" ("project_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_0c0aa1e82560a8ccb0983eaf6a"`);
        await queryRunner.query(`DROP INDEX "IDX_84117be4ac9bf5b251ba236a2c"`);
        await queryRunner.query(`ALTER TABLE "pm_tasks" RENAME TO "temporary_pm_tasks"`);
        await queryRunner.query(`CREATE TABLE "pm_tasks" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "project_id" integer NOT NULL, "title" varchar(200) NOT NULL, "description" text, "dueDate" datetime, "status" varchar(16) NOT NULL DEFAULT ('pending'), "assignee_id" integer, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
        await queryRunner.query(`INSERT INTO "pm_tasks"("id", "project_id", "title", "description", "dueDate", "status", "assignee_id", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "project_id", "title", "description", "dueDate", "status", "assignee_id", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "temporary_pm_tasks"`);
        await queryRunner.query(`DROP TABLE "temporary_pm_tasks"`);
        await queryRunner.query(`CREATE INDEX "IDX_0c0aa1e82560a8ccb0983eaf6a" ON "pm_tasks" ("project_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_84117be4ac9bf5b251ba236a2c" ON "pm_tasks" ("user_id") `);
        await queryRunner.query(`DROP INDEX "IDX_31a99f9de3f948d70839cedb20"`);
        await queryRunner.query(`ALTER TABLE "pm_risks" RENAME TO "temporary_pm_risks"`);
        await queryRunner.query(`CREATE TABLE "pm_risks" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "project_id" integer NOT NULL, "level" varchar(16) NOT NULL DEFAULT ('medium'), "reason" text NOT NULL, "detectedAt" datetime NOT NULL, "resolvedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "pm_risks"("id", "project_id", "level", "reason", "detectedAt", "resolvedAt", "createdAt", "updatedAt") SELECT "id", "project_id", "level", "reason", "detectedAt", "resolvedAt", "createdAt", "updatedAt" FROM "temporary_pm_risks"`);
        await queryRunner.query(`DROP TABLE "temporary_pm_risks"`);
        await queryRunner.query(`CREATE INDEX "IDX_31a99f9de3f948d70839cedb20" ON "pm_risks" ("project_id") `);
        await queryRunner.query(`DROP INDEX "IDX_3b61033ae23e7d3cb0c3ced2de"`);
        await queryRunner.query(`ALTER TABLE "pm_milestones" RENAME TO "temporary_pm_milestones"`);
        await queryRunner.query(`CREATE TABLE "pm_milestones" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "project_id" integer NOT NULL, "title" varchar(200) NOT NULL, "dueDate" datetime, "status" varchar(16) NOT NULL DEFAULT ('pending'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "pm_milestones"("id", "project_id", "title", "dueDate", "status", "createdAt", "updatedAt") SELECT "id", "project_id", "title", "dueDate", "status", "createdAt", "updatedAt" FROM "temporary_pm_milestones"`);
        await queryRunner.query(`DROP TABLE "temporary_pm_milestones"`);
        await queryRunner.query(`CREATE INDEX "IDX_3b61033ae23e7d3cb0c3ced2de" ON "pm_milestones" ("project_id") `);
        await queryRunner.query(`DROP INDEX "IDX_b4bc2a68d75821167894fb2749"`);
        await queryRunner.query(`DROP INDEX "IDX_db5ceaaa8d8012006478fb24de"`);
        await queryRunner.query(`ALTER TABLE "pm_members" RENAME TO "temporary_pm_members"`);
        await queryRunner.query(`CREATE TABLE "pm_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "project_id" integer NOT NULL, "user_id" integer NOT NULL, "role" varchar(16) NOT NULL DEFAULT ('member'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "pm_members"("id", "project_id", "user_id", "role", "createdAt", "updatedAt") SELECT "id", "project_id", "user_id", "role", "createdAt", "updatedAt" FROM "temporary_pm_members"`);
        await queryRunner.query(`DROP TABLE "temporary_pm_members"`);
        await queryRunner.query(`CREATE INDEX "IDX_b4bc2a68d75821167894fb2749" ON "pm_members" ("project_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_db5ceaaa8d8012006478fb24de" ON "pm_members" ("user_id") `);
        await queryRunner.query(`DROP INDEX "IDX_0c0aa1e82560a8ccb0983eaf6a"`);
        await queryRunner.query(`DROP INDEX "IDX_84117be4ac9bf5b251ba236a2c"`);
        await queryRunner.query(`DROP TABLE "pm_tasks"`);
        await queryRunner.query(`DROP INDEX "IDX_31a99f9de3f948d70839cedb20"`);
        await queryRunner.query(`DROP TABLE "pm_risks"`);
        await queryRunner.query(`DROP INDEX "IDX_3b61033ae23e7d3cb0c3ced2de"`);
        await queryRunner.query(`DROP TABLE "pm_milestones"`);
        await queryRunner.query(`DROP INDEX "IDX_b4bc2a68d75821167894fb2749"`);
        await queryRunner.query(`DROP INDEX "IDX_db5ceaaa8d8012006478fb24de"`);
        await queryRunner.query(`DROP TABLE "pm_members"`);
        await queryRunner.query(`DROP INDEX "IDX_9573db5e752a122c295abeb5da"`);
        await queryRunner.query(`DROP INDEX "IDX_d67f2318b32f65bbbf32e55207"`);
        await queryRunner.query(`DROP TABLE "pm_projects"`);
    }

}
