// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddConversationSummary1787100000000 implements MigrationInterface {
    name = 'AddConversationSummary1787100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "ai_conversations" ADD "summary" text`);
            return;
        }
        await queryRunner.query(`ALTER TABLE "ai_conversations" ADD "summary" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "ai_conversations" DROP COLUMN "summary"`);
            return;
        }
        await queryRunner.query(`ALTER TABLE "ai_conversations" DROP COLUMN "summary"`);
    }

}
