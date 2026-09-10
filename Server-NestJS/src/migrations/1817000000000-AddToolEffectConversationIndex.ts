// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddToolEffectConversationIndex1817000000000 implements MigrationInterface {
    name = 'AddToolEffectConversationIndex1817000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_a7fd30a8bc01dcc1cc89f63d83" ON "ai_tool_side_effects" ("conversation_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_a7fd30a8bc01dcc1cc89f63d83"`);
    }

}
