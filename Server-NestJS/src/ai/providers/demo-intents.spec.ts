// SPDX-License-Identifier: Apache-2.0

/**
 * CE-1 B4-demo：demo 用户首轮意图表 双向对账门禁。
 * declare 单源（demo-intents.ts DEMO_USER_INTENTS，provider 表驱动消费）== specs/protocol/demo-intent-v1.json
 * 语料 cases——任一侧变更都先红，须同步对侧（CE-1 L3 单源规则）。随 npm test 入 CI。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO_USER_INTENTS } from './demo-intents';

const corpus = JSON.parse(
  readFileSync(resolve(__dirname, '../../../specs/protocol/demo-intent-v1.json'), 'utf8'),
) as { vectorVersion: string; cases: Array<Record<string, unknown>> };

describe('demo 用户首轮意图表 · CE-1 B4-demo 语料对账', () => {
  it('declare 单源 == specs 语料 cases（字段级一致、保序）', () => {
    const declared = DEMO_USER_INTENTS.map((i) => ({
      key: i.key,
      name: i.name,
      pattern: i.pattern,
      tool: i.tool,
      content: i.content,
      argsKind: i.argsKind,
      write: i.write,
    }));
    expect(declared).toEqual(corpus.cases);
  });

  it('意图 key 唯一、含全部旗舰写/阻断意图', () => {
    const keys = corpus.cases.map((c) => String(c.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining(['delete_customer', 'query_customers', 'create_followup_task']),
    );
    // 写意图恰为 create_followup_task（进确认门控）；delete 为 R5 演示阻断
    const writes = corpus.cases.filter((c) => c.write === true).map((c) => c.key);
    expect(writes).toEqual(['create_followup_task']);
  });
});
