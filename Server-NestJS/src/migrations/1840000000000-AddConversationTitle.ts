// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * 工作账本：给会话加一个用户可命名的标题。
 *
 * 可空 —— 存量会话没有标题是常态，前端在此之前一直用「首条消息」派生预览，故本列缺席不改变任何既有行为。
 */
export class AddConversationTitle1840000000000 implements MigrationInterface {
    name = 'AddConversationTitle1840000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "ai_conversations" ADD "title" character varying(120)`);
            return;
        }
        await queryRunner.query(`ALTER TABLE "ai_conversations" ADD "title" varchar(120)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "ai_conversations" DROP COLUMN "title"`);
            return;
        }
        await queryRunner.query(`ALTER TABLE "ai_conversations" DROP COLUMN "title"`);
    }

}
