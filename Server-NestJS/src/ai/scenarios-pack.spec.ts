// SPDX-License-Identifier: Apache-2.0

/**
 * CE-1 B4-场景包 v1：行为级场景语料 ↔ 真源 漂移门。
 * - security-showcase-v1.json：运行时 SecurityShowcaseService.listScenarios() 的 {id,category} 集合
 *   + runScenario(id).outcome == 语料 cases（强双向漂移门，本包核心单一真源保证）。
 * - failure-path-v1.json：pack 的 FP id 集合 == docs/failure-path-corpus.spec.md 解析出的 `FP-数字` 行集合
 *   （doc↔pack 漂移门）。
 * - golden-application-v1.json：pack 步骤（index/序号/title）== test/golden-application.e2e-spec.ts
 *   的 it('①..⑧ …') 标题**逐字门**（机器解析 it 标题为结构化步骤）。
 * - trust-proof-v1.json：pack 场景（seq/title）== scripts/verify-trust-proof.mjs 的 console.log('[S<n>] …') 标签（逐字）。
 * - cross-entry-v1.json：pack 步骤（index/title）== test/cross-entry-consistency.e2e-spec.ts 的 it('①..④ …')（逐字）。
 * 随 npm test 入 CI；任一侧变更都先红，须先同步运行时/文档真源（CE-1 L3 单源规则）。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv';
import { SecurityShowcaseService } from './security-showcase/security-showcase.service';
import { CaslAbilityFactory } from '../common/casl/casl-ability.factory';

const SPECS_DIR = resolve(__dirname, '../../specs/scenarios');
const FAILURE_PATH_DOC = resolve(__dirname, '../../../docs/failure-path-corpus.spec.md');
const GOLDEN_E2E = resolve(__dirname, '../../test/golden-application.e2e-spec.ts');
const TRUST_PROOF_SCRIPT = resolve(__dirname, '../../scripts/verify-trust-proof.mjs');
const CROSS_ENTRY_E2E = resolve(__dirname, '../../test/cross-entry-consistency.e2e-spec.ts');

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
const trustPack = loadPack('trust-proof-v1.json');
const crossEntryPack = loadPack('cross-entry-v1.json');

describe('CE-1 B4 场景包 · 语料漂移门', () => {
  describe('共同字段 / common fields', () => {
    const packs: Array<[string, ScenarioPack]> = [
      ['security-showcase-v1.json', showcasePack],
      ['golden-application-v1.json', goldenPack],
      ['failure-path-v1.json', failurePack],
      ['trust-proof-v1.json', trustPack],
      ['cross-entry-v1.json', crossEntryPack],
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

    it('pack case 各字段 == doc 表格行（id/title/scenario/expected/status/layer 逐字段）', () => {
      const rows = doc
        .split(/\r?\n/)
        .map((line) => /^\|\s*(FP-\d+)\s*\|(.*)$/.exec(line))
        .filter((m): m is RegExpExecArray => !!m)
        .map((m) => {
          const cells = m[2].split('|').map((c) => c.trim());
          return {
            id: m[1],
            title: cells[0],
            scenario: cells[1],
            expected: cells[2],
            status: cells[3],
            layer: cells[4],
          };
        });
      const packCases = failurePack.cases.map((c: any) => ({
        id: c.id,
        title: c.title,
        scenario: c.scenario,
        expected: c.expected,
        status: c.status,
        layer: c.layer,
      }));
      expect(rows.length).toBeGreaterThan(0);
      expect(packCases).toEqual(rows);
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

  describe('golden-application-v1 · pack↔e2e 漂移门', () => {
    // 真源 = test/golden-application.e2e-spec.ts 的 it('<①..⑧> <标题>') —— 解析为结构化步骤，与 pack 逐字比对
    const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
    const e2eSteps = readFileSync(GOLDEN_E2E, 'utf8')
      .split(/\r?\n/)
      .map((line) => /it\('([①②③④⑤⑥⑦⑧⑨])\s*([^']*)'/.exec(line))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ mark: m[1], title: m[2] }));

    it('pack 步数 == e2e 步骤数（任一方增删步骤→红）', () => {
      expect(e2eSteps.length).toBeGreaterThan(0);
      expect(goldenPack.steps.length).toBe(e2eSteps.length);
    });

    it('每步 index 连续、序号标记对应、title 与 e2e it() 标题逐字一致', () => {
      goldenPack.steps.forEach((s: any, i: number) => {
        expect(s.index).toBe(i + 1);
        expect(s.mark ?? CIRCLED[i]).toBe(e2eSteps[i].mark);
        expect(s.title).toBe(e2eSteps[i].title);
      });
    });

    it('每步 key 非空且唯一', () => {
      const keys = goldenPack.steps.map((s: any) => s.key);
      keys.forEach((k: string) => expect(typeof k === 'string' && k.length > 0).toBe(true));
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe('trust-proof-v1 · pack↔脚本 漂移门', () => {
    // 真源 = scripts/verify-trust-proof.mjs 的 console.log('\n[S<n>] <标题>') 场景标签（保序 = 脚本发射序）
    const scriptScenarios = readFileSync(TRUST_PROOF_SCRIPT, 'utf8')
      .split(/\r?\n/)
      .map((line) => /console\.log\('\\n\[(S\d+)\]\s*([^']*)'\)/.exec(line))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ seq: m[1], title: m[2] }));

    it('pack 场景数 == 脚本发射数（任一增删→红）', () => {
      expect(scriptScenarios.length).toBeGreaterThan(0);
      expect(trustPack.scenarios.length).toBe(scriptScenarios.length);
    });

    it('每场景 seq/title 与脚本标签逐字一致', () => {
      trustPack.scenarios.forEach((s: any, i: number) => {
        expect(s.seq).toBe(scriptScenarios[i].seq);
        expect(s.title).toBe(scriptScenarios[i].title);
      });
    });

    it('每场景 key 非空且唯一', () => {
      const keys = trustPack.scenarios.map((s: any) => s.key);
      keys.forEach((k: string) => expect(typeof k === 'string' && k.length > 0).toBe(true));
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe('cross-entry-v1 · pack↔e2e 漂移门', () => {
    // 真源 = test/cross-entry-consistency.e2e-spec.ts 的 it('<①..④> <标题>')（§internal.17 T5）
    const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
    const e2eSteps = readFileSync(CROSS_ENTRY_E2E, 'utf8')
      .split(/\r?\n/)
      .map((line) => /it\('([①②③④⑤⑥⑦⑧⑨])\s*([^']*)'/.exec(line))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ mark: m[1], title: m[2] }));

    it('pack 步数 == e2e 步骤数（任一方增删步骤→红）', () => {
      expect(e2eSteps.length).toBeGreaterThan(0);
      expect(crossEntryPack.steps.length).toBe(e2eSteps.length);
    });

    it('每步 index 连续、序号标记对应、title 与 e2e it() 标题逐字一致', () => {
      crossEntryPack.steps.forEach((s: any, i: number) => {
        expect(s.index).toBe(i + 1);
        expect(CIRCLED[i]).toBe(e2eSteps[i].mark);
        expect(s.title).toBe(e2eSteps[i].title);
      });
    });

    it('每步 key 非空且唯一', () => {
      const keys = crossEntryPack.steps.map((s: any) => s.key);
      keys.forEach((k: string) => expect(typeof k === 'string' && k.length > 0).toBe(true));
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  /**
   * replay 语法门（`conformance-profile.md` §2.4 修订 v1）。
   *
   * **为什么存在**：JV-15 Slice 0 在第二载体上实跑后发现草稿的 `replay` **无法执行**——`call` 把
   * HTTP 方法 / 路径 / JSON-RPC 方法 / 工具名挤在一串里，`expect` 里还有中文散文。根因是它把
   * 「契约操作」与「参照实现的路由」混在一起。修订后的语法：**`call` 引用 wire 对象，不引用路径**。
   *
   * **选入式**：只对声明了 `replayVersion` 的包生效。未声明的包其 `replay` 仍是散文（改齐之前不纳入
   * 本门），但**不被静默放过**——下方把「已选入 / 未选入」两组显式列出来。
   *
   * **非空转**：本门自带正反例，即使当前 0 个包选入也真实断言语法。这是本仓 JV-14 的教训
   * （「一条看起来在验证 X 的断言，实际从未验证过」）所要求的：断言必须证明自己会红。
   */
  describe('replay 语法 · replayVersion 选入门（§2.4 v1）', () => {
    // 与 Full 剖面 runner（`scripts/verify-full-profile.mjs`）同一套 Ajv 选项：不校验 meta-schema、非严格模式，
    // 免得把 draft-07 元模式与未知关键字的告警当成语料不合规。
    const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
    ajv.addSchema(JSON.parse(readFileSync(resolve(SPECS_DIR, 'replay.schema.json'), 'utf8')));
    const validateEntry = ajv.compile({ $ref: 'replay.schema.json#/definitions/replayEntry' });

    const PACKS: Array<[string, any]> = [
      ['security-showcase-v1.json', showcasePack],
      ['golden-application-v1.json', goldenPack],
      ['failure-path-v1.json', failurePack],
      ['trust-proof-v1.json', trustPack],
      ['cross-entry-v1.json', crossEntryPack],
    ];

    it('语法自证（正例）：结构化 call / expect 通过', () => {
      expect(validateEntry({
        call: { tool: 'create_followup_task', args: { customerId: 1 } },
        expect: { status: 'pending_confirmation' },
      })).toBe(true);
      expect(validateEntry({
        call: { read: 'audit-chain-verification' },
        expect: { valid: true },
      })).toBe(true);
    });

    it('语法自证（反例）：旧草稿的四种写法逐条被拒', () => {
      const cases: Array<[string, any]> = [
        ['① call 是字符串（方法+路径+方法名挤一串）',
          { call: 'POST /api/v1/mcp tools/call delete_customer', expect: { blocked: true } }],
        ['② expect 键是散文', { call: { read: 'audit-chain-verification' }, expect: { 离线验证: 'PASS' } }],
        ['③ expect 值不是字面量', { call: { read: 'audit-chain-verification' }, expect: { x: { y: 1 } } }],
        ['④ 缺 expect', { call: { read: 'audit-chain-verification' } }],
      ];
      for (const [label, entry] of cases) {
        expect([label, validateEntry(entry)]).toEqual([label, false]);
      }
    });

    it('选入的包：每个 replay 元素过语法；未选入的包显式列出（不静默放过）', () => {
      const optedIn = PACKS.filter(([, pack]) => pack.replayVersion !== undefined);
      const notOptedIn = PACKS.filter(([, pack]) => pack.replayVersion === undefined);

      // 可见性：两组都点名，避免「门存在但 0 包受约束」被读成「全部合规」。
      console.log(`  replay 语法门：已选入 ${optedIn.length} 包 · 未选入 ${notOptedIn.length} 包（${
        notOptedIn.map(([f]) => f).join(', ') || '无'}）`);
      expect(optedIn.length + notOptedIn.length).toBe(PACKS.length);

      for (const [file, pack] of optedIn) {
        expect([file, pack.replayVersion]).toEqual([file, 1]);
        const containerKey = ['steps', 'cases', 'scenarios'].find((k) => Array.isArray(pack[k]));
        expect([file, typeof containerKey]).toEqual([file, 'string']);
        for (const step of pack[containerKey as string]) {
          if (!Array.isArray(step.replay)) continue; // 未给 replay 的条目不在本门范围
          const label = step.key ?? step.id;
          for (const entry of step.replay) {
            expect([file, label, validateEntry(entry)]).toEqual([file, label, true]);
          }
          if (step.given !== undefined) {
            expect([file, label, typeof step.given.actor]).toEqual([file, label, 'string']);
          }
        }
      }
    });
  });
});
