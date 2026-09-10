// SPDX-License-Identifier: Apache-2.0

/**
 * CE-1 B4-场景包 v1：行为级场景语料 ↔ 真源 漂移门。
 * - security-showcase-v1.json：运行时 SecurityShowcaseService.listScenarios() 的 {id,category} 集合
 *   + runScenario(id).outcome == 语料 cases（强双向漂移门，本包核心单一真源保证）。
 * - failure-path-v1.json：pack 的 FP id 集合 == docs/failure-path-corpus.spec.md 解析出的 `FP-数字` 行集合
 *   （doc↔pack 漂移门）。
 * - golden-application-v1.json：结构 sanity（index 1..8 连续、key/title 齐备）——e2e 步骤为自然语言断言，
 *   无结构化 declare，故此处为索引而非强漂移。
 * 随 npm test 入 CI；任一侧变更都先红，须先同步运行时/文档真源（CE-1 L3 单源规则）。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SecurityShowcaseService } from './security-showcase/security-showcase.service';
import { CaslAbilityFactory } from '../common/casl/casl-ability.factory';

const SPECS_DIR = resolve(__dirname, '../../specs/scenarios');
const FAILURE_PATH_DOC = resolve(__dirname, '../../../docs/failure-path-corpus.spec.md');

interface ScenarioPack {
  vectorVersion: string;
  protocol: string;
  license: string;
  note: string;
}

function loadPack(file: string): any {
  return JSON.parse(readFileSync(resolve(SPECS_DIR, file), 'utf8'));
}

const showcasePack = loadPack('security-showcase-v1.json');
const goldenPack = loadPack('golden-application-v1.json');
const failurePack = loadPack('failure-path-v1.json');

describe('CE-1 B4 场景包 · 语料漂移门', () => {
  describe('共同字段 / common fields', () => {
    const packs: Array<[string, ScenarioPack]> = [
      ['security-showcase-v1.json', showcasePack],
      ['golden-application-v1.json', goldenPack],
      ['failure-path-v1.json', failurePack],
    ];

    it.each(packs)('%s 含 vectorVersion/protocol/license/note 且 license=Apache-2.0', (_name, pack) => {
      expect(typeof pack.vectorVersion).toBe('string');
      expect(pack.vectorVersion.length).toBeGreaterThan(0);
      expect(typeof pack.protocol).toBe('string');
      expect(pack.protocol.length).toBeGreaterThan(0);
      expect(pack.license).toBe('Apache-2.0');
      expect(typeof pack.note).toBe('string');
      expect(pack.note.length).toBeGreaterThan(0);
    });
  });

  describe('security-showcase-v1 · 运行时强漂移门', () => {
    // listScenarios 不依赖 caslFactory；runScenario('unauthorized') 需真实行级规则 → 用真实工厂（最小依赖，无需 DI 容器）
    const service = new SecurityShowcaseService(new CaslAbilityFactory());

    it('listScenarios() 的 id/category 集合 == 语料 cases（任一变更→红）', () => {
      const runtime = service.listScenarios().map((s) => ({ id: s.id, category: s.category }));
      const corpus = showcasePack.cases.map((c: any) => ({ id: c.id, category: c.category }));
      expect(runtime).toEqual(corpus);
    });

    it('runScenario(id).outcome == 语料 cases.outcome（4 场景）', () => {
      for (const c of showcasePack.cases) {
        expect(service.runScenario(c.id).outcome).toBe(c.outcome);
      }
    });
  });

  describe('failure-path-v1 · doc↔pack 漂移门', () => {
    const doc = readFileSync(FAILURE_PATH_DOC, 'utf8');
    const docIds = doc
      .split(/\r?\n/)
      .map((line) => /^\|\s*(FP-\d+)\s*\|/.exec(line)?.[1])
      .filter((x): x is string => !!x);

    it('语料 FP id 集合 == docs/failure-path-corpus.spec.md 表格行集合', () => {
      const packIds = failurePack.cases.map((c: any) => c.id);
      expect([...new Set(packIds)].sort()).toEqual([...new Set(docIds)].sort());
    });

    it('FP id 唯一且含 FP-1..FP-9', () => {
      const packIds = failurePack.cases.map((c: any) => c.id);
      expect(new Set(packIds).size).toBe(packIds.length);
      expect(packIds).toEqual(
        expect.arrayContaining([
          'FP-1', 'FP-2', 'FP-3', 'FP-4', 'FP-5',
          'FP-6', 'FP-7', 'FP-8', 'FP-9',
        ]),
      );
    });
  });

  describe('golden-application-v1 · 结构 sanity（e2e 无机器源，为索引）', () => {
    it('index 连续 1..8 且每步有唯一 key + title', () => {
      const steps = goldenPack.steps;
      expect(steps.length).toBe(8);
      expect(steps.map((s: any) => s.index)).toEqual(steps.map((_: any, i: number) => i + 1));
      for (const s of steps) {
        expect(typeof s.key).toBe('string');
        expect(s.key.length).toBeGreaterThan(0);
        expect(typeof s.title).toBe('string');
        expect(s.title.length).toBeGreaterThan(0);
      }
      const keys = steps.map((s: any) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });
});
