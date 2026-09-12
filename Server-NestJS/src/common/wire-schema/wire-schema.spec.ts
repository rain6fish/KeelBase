// SPDX-License-Identifier: Apache-2.0

/**
 * CE-1 wire Schema 冻结校验（specs/protocol/wire-schema-registry.json）。
 *
 * 把 wire 形状锁成常绿门禁（语义变更必须先落语料/Schema 版本再改实现，CE-1 L3 / C-1）：
 *   1. registry 每个对象 schema 存在且可被 ajv 解析（跨版本按 $id 索引）＋版本 ∈ {v1,v2}；
 *   2. 每份代表样例通过其对象 schema（跨文件 $id 引用已全局注册）；
 *   3. 对象清单冻结（增删 wire 对象必须同步本测试——形状变更先升 v2 再改代码）。
 *
 * schema 为人工策展快照（非自动派生）；来源锚见各 schema description 与 registry.source。
 * 仅依赖 ajv / ajv-formats（package-lock 内既有传递依赖，版本锁定）。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const SPECS = resolve(__dirname, '../../../specs/protocol');
const registry = JSON.parse(readFileSync(resolve(SPECS, 'wire-schema-registry.json'), 'utf8')) as {
  schemasDir: string;
  objects: Array<{ id: string; version: string; schema: string; samples: string[] }>;
};

/** 对象清单冻结（Registry 顺序无关）——增删 wire 对象必须同步此处。 */
const FROZEN_OBJECT_IDS = [
  'tool-definition',
  'ai-tool-inventory',
  'sse-event',
  'confirmation-request',
  'confirmation-decision',
  'confirm-decision-body',
  'trace-step',
  'side-effect-revoke',
  'audit-payload',
  'evidence-package',
  'governance-policy',
  'delegation-token-claims',
  'api-response',
  'error-body',
  'chat-response',
  'conversation-data',
  'ws-frame',
  'external-audit',
  'external-effects-report',
  'external-effects-query',
  'internal-approvals-execute',
  'sidecar-policy-push',
  'governance-confirmation-item',
  'headless-chat-response',
  'capabilities',
  'tool-invocation',
  // PC-1（CE-2 缺口）：Explainable Authz 决策 wire——本人能力清单 + 单决策
  'permission-capability-list',
  'permission-decision',
  // PC-2（CE-2 缺口）：审计查询行 + 聚合端点响应 wire
  'ai-audit-log-row',
  'operation-audit-log-row',
  'audit-chain-verification',
  'audit-usage-stats',
  'audit-cost-breakdown',
  'audit-action-report',
  // 审计链 payload 收口：op-audit payload（evidence-package v2 的 chainRow.payload oneOf 依赖它）
  'operation-audit-payload',
  // E 收口：MCP 出口 tools/list 治理投影（annotations.readOnlyHint/destructiveHint + _meta.keelbase）
  'mcp-tool-list',
];

const failures: string[] = [];
const check = (cond: boolean, label: string) => {
  if (!cond) failures.push(label);
};

describe('CE-1 wire Schema 冻结（specs/protocol/schemas v1/v2 + registry）', () => {
  // 递归扫描 schemas/ 下所有版本目录（v1/v2/...），以各 schema 的 $id 为键（版本间同名文件不冲突）。
  const root = resolve(SPECS, registry.schemasDir);
  const schemas = new Map<string, object>();
  for (const f of readdirSync(root, { recursive: true }) as string[]) {
    if (!f.endsWith('.schema.json')) continue;
    const schema = JSON.parse(readFileSync(resolve(root, f), 'utf8')) as { $id?: string };
    if (!schema.$id) {
      failures.push(`schema 缺 $id: ${f}`);
      continue;
    }
    schemas.set(schema.$id, schema);
  }

  // validateSchema:false —— 不加载/套用 draft-07 meta 校验 schema 本体（schema 自述 $schema 仅供文档；
  // 结构非法仍会在 validate 时对样例失败暴露）。样例语义校验不受影响。
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
  addFormats(ajv);
  // 注册全部 schema（含 support，供 $ref）——以 $id 为键
  for (const [id, schema] of schemas) {
    try {
      ajv.addSchema(schema, id);
    } catch (e) {
      failures.push(`schema 非法: ${id} — ${String(e)}`);
    }
  }

  it('registry：对象清单冻结（增删必须同步本测试）', () => {
    const ids = registry.objects.map((o) => o.id).sort();
    check(JSON.stringify(ids) === JSON.stringify([...FROZEN_OBJECT_IDS].sort()), `对象清单漂移: ${ids.join(',')}`);
  });

  it('registry：每对象 version ∈ {v1,v2}、schema($id) 存在、样例非空且在盘', () => {
    for (const o of registry.objects) {
      check(o.version === 'v1' || o.version === 'v2', `${o.id}: version 非法（${o.version}）`);
      check(schemas.has(o.schema), `${o.id}: schema ${o.schema} 缺失`);
      check(Array.isArray(o.samples) && o.samples.length > 0, `${o.id}: 样例为空`);
      for (const rel of o.samples) {
        try {
          readFileSync(resolve(SPECS, rel), 'utf8');
        } catch {
          failures.push(`${o.id}: 样例 ${rel} 缺失`);
        }
      }
    }
  });

  it('样例：每份代表样例通过其对象 schema（draft-07）', () => {
    for (const o of registry.objects) {
      for (const rel of o.samples) {
        const sample = JSON.parse(readFileSync(resolve(SPECS, rel), 'utf8')) as unknown;
        const ok = ajv.validate(o.schema, sample);
        if (!ok) failures.push(`${o.id} / ${rel} 校验失败: ${ajv.errorsText()}`);
      }
    }
  });

  it('汇总：以上断言全部通过', () => {
    expect(failures).toEqual([]);
  });
});
