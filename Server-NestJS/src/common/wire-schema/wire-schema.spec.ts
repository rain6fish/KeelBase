// SPDX-License-Identifier: Apache-2.0

/**
 * CE-1 wire Schema v1 冻结校验（specs/protocol/wire-schema-registry.json）。
 *
 * 把 wire 形状锁成常绿门禁（语义变更必须先落语料/Schema 版本再改实现，CE-1 L3 / C-1）：
 *   1. registry 每个对象 schema 存在且为合法 JSON Schema（ajv addSchema 即校验 meta）＋版本 v1；
 *   2. 每份代表样例通过其对象 schema（跨文件 $id 引用已全局注册）；
 *   3. 对象清单冻结（增删 wire 对象必须同步本测试——新增形状先升 v2 再改代码）。
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

/** v1 冻结对象清单（Registry 顺序无关）——增删 wire 对象必须同步此处。 */
const FROZEN_OBJECT_IDS = [
  'tool-definition',
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
];

const failures: string[] = [];
const check = (cond: boolean, label: string) => {
  if (!cond) failures.push(label);
};

describe('CE-1 wire Schema v1 冻结（specs/protocol/schemas + registry）', () => {
  const dir = resolve(SPECS, registry.schemasDir);
  const schemas = new Map<string, object>();
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.schema.json')) {
      schemas.set(f, JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as object);
    }
  }

  // validateSchema:false —— 不加载/套用 draft-07 meta 校验 schema 本体（schema 自述 $schema 仅供文档；
  // 结构非法仍会在 validate 时对样例失败暴露）。样例语义校验不受影响。
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
  addFormats(ajv);
  // 注册全部 schema（含 support，供 $ref）
  for (const [name, schema] of schemas) {
    try {
      ajv.addSchema(schema, name);
    } catch (e) {
      failures.push(`schema 非法: ${name} — ${String(e)}`);
    }
  }

  it('registry：对象清单冻结（v1，增删必须同步本测试）', () => {
    const ids = registry.objects.map((o) => o.id).sort();
    check(JSON.stringify(ids) === JSON.stringify([...FROZEN_OBJECT_IDS].sort()), `对象清单漂移: ${ids.join(',')}`);
  });

  it('registry：每对象 version=v1、schema 存在、样例非空且在盘', () => {
    for (const o of registry.objects) {
      check(o.version === 'v1', `${o.id}: version≠v1`);
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
