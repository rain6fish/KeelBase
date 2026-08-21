/**
 * Provenance DNA：.keelbase/manifest.json 的来源身份清单（设计建议 §八）。
 *
 * 由 keelbase init 生成/幂等合并；keelbase inspect 读取。纯 JSON 元数据：
 * 删除不破坏任何代码与运行行为，仅丢失「来源/能力身份」声明。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const MANIFEST_SCHEMA = 1;
export const MANIFEST_IDENTITY = 'keelbase-application';
export const MANIFEST_PROTOCOL = '1.0';
export const MANIFEST_GENERATOR = 'keelbase';

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

/** 读清单；缺失或 schema 不匹配返回 null（不抛错——非 KeelBase 项目也是合法输入）。 */
export async function readManifest(root = '') {
  try {
    const raw = await readFile(manifestPath(root), 'utf8');
    const m = JSON.parse(raw);
    return m && m.schema === MANIFEST_SCHEMA ? m : null;
  } catch {
    return null;
  }
}

/** 幂等合并：modules 追加去重（排序保证确定性）；schema/identity/protocol 固定，generatorVersion 随当前 CLI。 */
export async function mergeManifest(modulePlural, root = '') {
  const existing = await readManifest(root);
  const modules = new Set(Array.isArray(existing?.modules) ? existing.modules : []);
  if (modulePlural) modules.add(modulePlural);
  return {
    schema: MANIFEST_SCHEMA,
    identity: MANIFEST_IDENTITY,
    generator: MANIFEST_GENERATOR,
    generatorVersion: await generatorVersion(),
    protocol: MANIFEST_PROTOCOL,
    modules: [...modules].sort(),
  };
}

/** 写清单（root 相对路径已含在 manifestPath；模块已存在则只更新版本不重复）。 */
export async function writeManifest(modulePlural, root = '') {
  const manifest = await mergeManifest(modulePlural, root);
  const file = manifestPath(root);
  await mkdir(file.substring(0, file.lastIndexOf('/')), { recursive: true });
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { file, manifest };
}
