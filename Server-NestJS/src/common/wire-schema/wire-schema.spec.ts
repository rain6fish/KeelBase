// SPDX-License-Identifier: Apache-2.0

/**
 * CE-1 wire Schema 冻结校验（specs/protocol/wire-schema-registry.json）。
 *
 * 把 wire 形状锁成常绿门禁（语义变更必须先落语料/Schema 版本再改实现，CE-1 L3 / C-1）：
 *   1. registry 每个对象 schema 存在且可被 ajv 解析（跨版本按 $id 索引）＋版本形如 v<N>；
 *   2. 每份代表样例通过其对象 schema（跨文件 $id 引用已全局注册）；
 *   3. 对象清单冻结（增删 wire 对象必须同步本测试——形状变更先升版本再改代码）。
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
  // AU-4（§22.19）：会话元数据视图（不含任何消息文本，「引用优先」的服务端落点）
  'conversation-meta',
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
  // PC-3（CE-2 缺口）：org/orgId 数据范围 membership wire
  'org-membership-scope',
  'org-member-item',
  'org-member-public',
  // PC-4（CE-2 缺口）：Agent 一级 wire 对象（身份 + capability + trustLevel，D5 Registry）
  'agent-registry-item',
  // ①补：app/* 边界端点（边界三件套 capabilities 的对偶；FE-1/ADR-0002 Rev-8 契约面）
  'app-version',
  'app-readiness',
  'app-provenance',
  // ①补：业务错误码目录（值域 + HTTP 映射）
  'api-error-code',
  // ② SM2 国密 + 时间锚（docs/evidence-root.spec.md §11.3）：当日证据根集合的定期锚记录
  'evidence-anchor',
  // GA 待我确认中心（docs/ai-action-center.spec.md §9）：本人确认记录（R3/R4 已决策读侧视图）
  'my-confirmation-item',
  // BA 异常行为基线（docs/ai-behavior-baseline.spec.md）：规则型告警事件
  'ai-behavior-alert',
];

const failures: string[] = [];
const check = (cond: boolean, label: string) => {
  if (!cond) failures.push(label);
};

describe('CE-1 wire Schema 冻结（specs/protocol/schemas v1/v2/v3 + registry）', () => {
  // 递归扫描 schemas/ 下所有版本目录（v1/v2/...），以各 schema 的 $id 为键（版本间同名文件不冲突）。
  //
  // **排序 + 高版本确定性胜出**（2026-09-23 修）：`$id` 用裸名是跨文件相对 `$ref` 所必需——v2/v3 目录
  // 只放「改过的那几个」schema，其余 `$ref` 要落到 v1，故不能按版本目录隔离注册。代价是同名 `$id`
  // 会被同键覆盖，而原先胜出者**取决于目录读取顺序**：一旦旧版本胜出，registry 里声明为 v3 的对象，
  // 其样例就会被 **v2 的 schema** 校验（假过或假红），且被覆盖的那份从未作为校验依据。
  // 现按路径排序（v1 → v2 → v3）令最高版本确定性胜出，并把「被覆盖的旧版本文件」显式登记——
  // 见下面「同名 $id」断言。
  const root = resolve(SPECS, registry.schemasDir);
  const schemas = new Map<string, { schema: object; path: string }>();
  const superseded: Array<{ id: string; path: string }> = [];
  const files = (readdirSync(root, { recursive: true }) as string[])
    .filter((f) => f.endsWith('.schema.json'))
    .map((f) => f.replace(/\\/g, '/'))
    .sort();
  for (const f of files) {
    const schema = JSON.parse(readFileSync(resolve(root, f), 'utf8')) as { $id?: string };
    if (!schema.$id) {
      failures.push(`schema 缺 $id: ${f}`);
      continue;
    }
    const prev = schemas.get(schema.$id);
    if (prev) superseded.push({ id: schema.$id, path: prev.path });
    schemas.set(schema.$id, { schema, path: f });
  }

  // validateSchema:false —— 不加载/套用 draft-07 meta 校验 schema 本体（schema 自述 $schema 仅供文档；
  // 结构非法仍会在 validate 时对样例失败暴露）。样例语义校验不受影响。
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
  addFormats(ajv);
  // 注册全部 schema（含 support，供 $ref）——以 $id 为键
  for (const [id, entry] of schemas) {
    try {
      ajv.addSchema(entry.schema, id);
    } catch (e) {
      failures.push(`schema 非法: ${id} — ${String(e)}`);
    }
  }

  it('同名 $id：高版本确定性胜出，被覆盖的旧版本如实登记（防旧版本反压 → 用错 schema 校验样例）', () => {
    // 全库当前只有一处：`evidence-package.schema.json`（v2 冻结 / v3 现行）。这条把「旧版本被新版本
    // 覆盖」从「读目录顺序的运气」变成受检事实：若排序或布局变化让 v2 反压 v3，本断言即红
    // （届时 v3 样例会被 v2 schema 校验而无人察觉）。
    const vnum = (p: string) => Number(/^v(\d+)\//.exec(p)?.[1] ?? 0);
    for (const s of superseded) {
      const winner = schemas.get(s.id);
      check(
        winner !== undefined && vnum(winner.path) > vnum(s.path),
        `$id 冲突但并非高版本胜出: ${s.id}（${s.path} 被覆盖，胜出者 ${winner?.path ?? '<缺失>'}）`,
      );
    }
  });

  it('registry：声明的 schema 由**声明版本**提供（防同名 $id 解析到别的版本）', () => {
    // registry 每个对象带 version；其 schema 文件的路径应以该版本目录开头。
    // 覆盖「对象声明 v3、实际却解析到 v2 文件」这类跨版本错配。
    for (const o of registry.objects) {
      const entry = schemas.get(o.schema);
      check(entry !== undefined, `${o.id}: schema ${o.schema} 未注册`);
      if (entry) {
        check(
          entry.path.startsWith(`${o.version}/`),
          `${o.id}: schema 解析到 ${entry.path}，与声明版本 ${o.version} 不符`,
        );
      }
    }
  });

  it('registry：对象清单冻结（增删必须同步本测试）', () => {
    const ids = registry.objects.map((o) => o.id).sort();
    check(JSON.stringify(ids) === JSON.stringify([...FROZEN_OBJECT_IDS].sort()), `对象清单漂移: ${ids.join(',')}`);
  });

  it('registry：每对象 version 形如 v<N>、schema($id) 存在、样例非空且在盘', () => {
    for (const o of registry.objects) {
      // 形如 v<N> 而非硬编码枚举：升版（v3、v4…）不必再改本断言；拼写错误（v2x / 2 / V2）仍被拦下。
      check(/^v\d+$/.test(o.version), `${o.id}: version 非法（${o.version}）`);
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
