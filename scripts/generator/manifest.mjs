// SPDX-License-Identifier: Apache-2.0

/**
 * Provenance：.keelbase/manifest.json 的来源身份清单（设计建议 §八）。
 *
 * 由 keelbase init 生成/幂等合并；keelbase inspect 读取。纯 JSON 元数据：
 * 删除不破坏任何代码与运行行为，仅丢失「来源/能力身份」声明。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const MANIFEST_SCHEMA = 1;
export const MANIFEST_IDENTITY = 'keelbase-application';
export const MANIFEST_PROTOCOL = '1.1';
export const MANIFEST_GENERATOR = 'keelbase';
export const MODULE_PROVENANCE_FILE = '.keelbase-provenance.json';
export const MODULE_PROVENANCE_SCHEMA = 1;

export function manifestPath(root = '') {
  return root ? `${root}/.keelbase/manifest.json` : '.keelbase/manifest.json';
}

/** 生成器自身版本（发布时随 npm 包携带的 package.json）。 */
export async function generatorVersion() {
  try {
    const pkg = JSON.parse(await readFile(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** 读清单；缺失或非法 JSON 返回 null（不抛错——非 KeelBase 项目也是合法输入）。schema 是否受支持由调用方判断。 */
export async function readManifest(root = '') {
  try {
    const m = JSON.parse(await readFile(manifestPath(root), 'utf8'));
    return m && typeof m === 'object' ? m : null;
  } catch {
    return null;
  }
}

/**
 * 幂等合并：modules 追加去重（排序保证确定性）；schema/identity/protocol 固定，generatorVersion 随当前 CLI。
 * 版本化防护：现有清单 schema 与当前不匹配 → 返回 null（拒绝覆盖，防更新版本创建的数据丢失）。
 *
 * `searchableModules` rides here too, and for the same reason: whether a module is searchable — and
 * **which of its columns** the search may touch — is a property of its **spec**, not of the generated
 * code, and the runtime already reads this file (`/app/provenance`). Putting it here means the global
 * search needs no hand-maintained list and no generator insertion into hand-written source — a module
 * generated tomorrow is searchable by construction.
 *
 * The columns are **declared, not derived**: `fields` is the spec's string/text fields, written here
 * by the generator. Deriving them at runtime from the entity instead would mean asking the column
 * metadata what type it is, and on this repo's driver a `varchar` column reports no type at all —
 * a search built that way matches nothing, silently, while its mocked unit tests stay green.
 *
 * Two different merge rules, on purpose:
 *   - `modules` is **add-only** — it records what was generated, and a later run must not erase it.
 *   - a module's `fields` are **refreshed** on regeneration — they are a product of the spec, so a
 *     stale copy is simply wrong. Entries are still never removed by another module's run; dropping
 *     a module from search stays a hand edit (or a spec change plus a rerun of that module).
 *
 * `searchableModules` 也放这里，理由相同：模块可不可搜 —— 以及**它的哪些列**可被搜 —— 是它 **spec**
 * 的属性、不是生成代码的属性，而运行时本来就读这份文件（`/app/provenance`）。放这里意味着全局搜索既
 * 不需要手工维护的清单，也不需要生成器往手写源码里插行 —— 明天生成的模块**由构造**就可搜。
 *
 * 列是**由声明来、不是推导来**：`fields` 是 spec 里的 string/text 字段，由生成器写进来。若改为运行时
 * 从实体推导，就要去问列元数据「你是什么类型」—— 而在本仓的驱动下 varchar 列**根本不报类型**，
 * 那样做出来的搜索会**静默什么也匹配不到**，而 mock 掉的单测照样全绿。
 *
 * 两条合并规则不同，是有意的：
 *   - `modules` 是**只增不减** —— 它记的是「生成过什么」，后续运行不得抹掉。
 *   - 模块的 `fields` 在**重生成时刷新** —— 它是 spec 的产物，陈旧的那份就是错的。但条目仍不会因
 *     别的模块的运行而被移除；把一个模块从搜索里拿掉，仍然靠手改（或改 spec 后重跑该模块）。
 */
export async function mergeManifest(modulePlural, root = '', opts = {}) {
  const existing = await readManifest(root);
  if (existing && existing.schema !== MANIFEST_SCHEMA) return null;
  const modules = new Set(Array.isArray(existing?.modules) ? existing.modules : []);
  if (modulePlural) modules.add(modulePlural);

  const searchable = new Map(
    (Array.isArray(existing?.searchableModules) ? existing.searchableModules : [])
      .filter((e) => e && typeof e === 'object' && typeof e.module === 'string')
      .map((e) => [e.module, normalizeSearchFields(e.fields)]),
  );
  if (modulePlural && opts.searchable === true) {
    searchable.set(modulePlural, normalizeSearchFields(opts.searchableFields));
  }

  return {
    schema: MANIFEST_SCHEMA,
    identity: MANIFEST_IDENTITY,
    generator: MANIFEST_GENERATOR,
    generatorVersion: await generatorVersion(),
    protocol: MANIFEST_PROTOCOL,
    modules: [...modules].sort(),
    searchableModules: [...searchable]
      .map(([module, fields]) => ({ module, fields }))
      .sort((a, b) => (a.module < b.module ? -1 : a.module > b.module ? 1 : 0)),
  };
}

/** Declared columns: strings only, de-duplicated, declaration order kept. */
/* 声明的列：只留字符串、去重、保持声明顺序。 */
export function normalizeSearchFields(fields) {
  return [...new Set((Array.isArray(fields) ? fields : []).filter((f) => typeof f === 'string' && f))];
}

/** 写清单（root 相对路径已含在 manifestPath；模块已存在则只更新版本不重复）。schema 不匹配 → changed:false + reason。 */
export async function writeManifest(modulePlural, root = '', opts = {}) {
  const merged = await mergeManifest(modulePlural, root, opts);
  const file = manifestPath(root);
  if (merged === null) return { file, changed: false, reason: 'schema-mismatch', manifest: null };
  await mkdir(file.substring(0, file.lastIndexOf('/')), { recursive: true });
  await writeFile(file, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  return { file, changed: true, manifest: merged };
}

/**
 * 模块级生成证明（DNA「AI-generated code is untrusted by default」的落地）：
 * 每个生成模块的目录写 .keelbase-provenance.json——来源（spec/openapi/schema/cli）+ 生成器版本 + 协议 + 生成时刻。
 * 与运行时 Business Action 链对应：运行侧「行为可追踪」，工程侧「代码可溯源」。
 * 删除不破坏任何代码与运行行为，仅丢失「出生证明」。
 */
export function moduleProvenancePath(module, root = '') {
  return root
    ? `${root}/Server-NestJS/src/${module}/${MODULE_PROVENANCE_FILE}`
    : `Server-NestJS/src/${module}/${MODULE_PROVENANCE_FILE}`;
}

/** 读模块级生成证明；缺失/非法返回 null。 */
export async function readModuleProvenance(module, root = '') {
  try {
    const p = JSON.parse(await readFile(moduleProvenancePath(module, root), 'utf8'));
    return p && typeof p === 'object' ? p : null;
  } catch {
    return null;
  }
}

/** 写模块级生成证明（幂等覆盖——每次生成刷新来源与时刻）。 */
export async function writeModuleProvenance(module, source, root = '') {
  const file = moduleProvenancePath(module, root);
  const provenance = {
    schema: MODULE_PROVENANCE_SCHEMA,
    module,
    generator: MANIFEST_GENERATOR,
    generatorVersion: await generatorVersion(),
    protocol: MANIFEST_PROTOCOL,
    source,
    generatedAt: new Date().toISOString(),
  };
  await mkdir(file.substring(0, file.lastIndexOf('/')), { recursive: true });
  await writeFile(file, JSON.stringify(provenance, null, 2) + '\n', 'utf8');
  return { file, provenance };
}
