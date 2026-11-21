#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Does a *published* artifact say which contract version it was built against?
 *
 * The question came out of the 2026-11-14 CTO weekly and had no gate behind it: CHANGELOG entries claim
 * that `0.1.18` / `0.1.19` carry contract v1.22.0, and that claim is checked nowhere. The release
 * workflow pins the contract by `ref:` when it checks the contract out, but nothing asks the artifact
 * itself — the bytes a consumer downloads from Maven Central — what it carries. A pin is a statement
 * about the build; the artifact is what the build produced. This script reads the second one.
 *
 * It downloads one artifact (version is an explicit argument — never "whatever is latest") from Maven
 * Central, verifies the published SHA-256 when Central offers one, and looks for the contract version
 * in a fixed, ordered list of declaration sites inside the jar:
 *
 *   1. `META-INF/MANIFEST.MF` — `KeelBase-Contract-Version`, `Contract-Version`,
 *      `X-KeelBase-Contract-Version`, `KeelBase-Contract`;
 *   2. `META-INF/keelbase-contract.properties` — `keelbase.contract.version`, `contract.version`,
 *      `version`;
 *   3. `<jar root>/keelbase-provenance.json` or `META-INF/keelbase-provenance.json` — `contractVersion`;
 *   4. the embedded POM `META-INF/maven/<group>/<artifact>/pom.xml` — `<properties>` key
 *      `keelbase.contract.version` or `contract.version`.
 *
 * Every site is reported as examined or absent, so a red run shows what was tried rather than only that
 * something failed.
 *
 * Exit codes are three, not two, because "the artifact says something else" and "the artifact says
 * nothing" are different findings and must not be conflated:
 *
 *   0 — a declaration was found and equals `--expect`;
 *   1 — a declaration was found and differs from `--expect` (the observed value is printed);
 *   2 — no declaration was found, or the artifact could not be downloaded/read. This is **not** a pass.
 *
 * 已发布到 Maven Central 的构件，到底说不说自己用的是哪一版契约？
 *
 * 这个问题出自 2026-11-14 的 CTO 周会，且没有任何门禁在守：CHANGELOG 声称 `0.1.18` / `0.1.19` 带着契约
 * v1.22.0，而这句声明**无人校验**。发布工作流在检出契约时用 `ref:` 钉了版本，但没有任何东西去问**构件本身**
 * —— 也就是消费者从 Central 下载到的那串字节 —— 它带的是什么。pin 说的是构建，构件才是构建的产物。
 * 本脚本读的是后者。
 *
 * 它下载一个构件（版本是**显式参数**，绝不取「最新」），Central 提供 SHA-256 时先校验，然后在 jar 内一份
 * 固定的、有顺序的声明位置清单里找契约版本：
 *
 *   1. `META-INF/MANIFEST.MF` —— `KeelBase-Contract-Version` / `Contract-Version` /
 *      `X-KeelBase-Contract-Version` / `KeelBase-Contract`；
 *   2. `META-INF/keelbase-contract.properties` —— `keelbase.contract.version` / `contract.version` /
 *      `version`；
 *   3. `<jar 根>/keelbase-provenance.json` 或 `META-INF/keelbase-provenance.json` —— `contractVersion`；
 *   4. 内嵌 POM `META-INF/maven/<group>/<artifact>/pom.xml` 的 `<properties>` ——
 *      `keelbase.contract.version` / `contract.version`。
 *
 * 每个位置都会报「查过 / 不存在」，于是红的运行给出的是**试过什么**，而不只是「失败了」。
 *
 * 退出码有三个而不是两个，因为「构件说的是别的」与「构件什么都没说」是两条不同的结论，不能混为一谈：
 *
 *   0 —— 找到声明，且等于 `--expect`；
 *   1 —— 找到声明，但与 `--expect` 不同（打印观测值）；
 *   2 —— 没有找到任何声明，或构件下载/读取失败。**这不是通过。**
 *
 * Usage / 用法:
 *   node scripts/check-artifact-contract.mjs --version <artifact-version> --expect <contract-version>
 *        [--artifact <id>] [--group <groupId>] [--repo <maven-repo-url>] [--jar <local.jar>] [--json]
 *   e.g. / 例:
 *   node scripts/check-artifact-contract.mjs --version 0.1.19 --expect v1.22.0
 *
 * Not part of `npm run check:all`, on purpose: it reads the network (Maven Central) and today answers
 * "undeclared" for every published artifact, so wiring it into a hermetic pre-push gate would make that
 * gate depend on a third party and be red by construction. See the hand-off report for why.
 *
 * 有意不进 `npm run check:all`：它要读网络（Maven Central），且今天对每个已发布构件都答「未声明」——
 * 接进封闭的推送前门禁，等于让那道门依赖第三方、并且注定常红。理由见交接报告。
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_REPO = 'https://repo1.maven.org/maven2';
const DEFAULT_GROUP = 'cn.com.keelbase';
const DEFAULT_ARTIFACT = 'keelbase4j-core';
const FETCH_TIMEOUT_MS = 30_000;
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;

const MANIFEST_ENTRY = 'META-INF/MANIFEST.MF';
const MANIFEST_KEYS = [
  'keelbase-contract-version',
  'contract-version',
  'x-keelbase-contract-version',
  'keelbase-contract',
];
const PROPERTIES_ENTRIES = ['META-INF/keelbase-contract.properties'];
const PROPERTIES_KEYS = ['keelbase.contract.version', 'contract.version', 'version'];
const PROVENANCE_ENTRIES = ['keelbase-provenance.json', 'META-INF/keelbase-provenance.json'];
const POM_KEYS = ['keelbase.contract.version', 'contract.version'];

/**
 * Manifest main attributes, lower-cased. A continuation line starts with a single space and appends to
 * the previous value (the JAR spec's 72-byte line folding), so it is joined before anything is read.
 *
 * 清单主属性，键名转小写。续行以一个空格开头、拼到上一条的值后面（JAR 规范 72 字节折行），所以先拼再读。
 */
export function parseManifest(text) {
  const attrs = new Map();
  let lastKey = null;
  for (const rawLine of text.replace(/\r\n/g, '\n').split('\n')) {
    if (rawLine === '') continue;
    if (rawLine.startsWith(' ')) {
      if (lastKey) attrs.set(lastKey, `${attrs.get(lastKey)}${rawLine.slice(1)}`);
      continue;
    }
    const colon = rawLine.indexOf(':');
    if (colon < 0) continue;
    lastKey = rawLine.slice(0, colon).trim().toLowerCase();
    attrs.set(lastKey, rawLine.slice(colon + 1).trim());
  }
  return attrs;
}

export function readManifestContractVersion(text) {
  const attrs = parseManifest(text);
  for (const key of MANIFEST_KEYS) {
    const value = attrs.get(key);
    if (value) return { value, site: `${MANIFEST_ENTRY} (${key})` };
  }
  return null;
}

/** `key=value` pairs; `#`/`!` comments and `:` as separator are tolerated the way java.util.Properties does. 属性文件；兼容 `#`/`!` 注释与 `:` 分隔符。 */
export function readPropertiesContractVersion(text, siteLabel) {
  const props = new Map();
  for (const rawLine of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#') || line.startsWith('!')) continue;
    const m = /^([^=:]+)[=:](.*)$/.exec(line);
    if (!m) continue;
    props.set(m[1].trim().toLowerCase(), m[2].trim());
  }
  for (const key of PROPERTIES_KEYS) {
    const value = props.get(key);
    if (value) return { value, site: `${siteLabel} (${key})` };
  }
  return null;
}

/** `<contractVersion>` inside a provenance JSON blob, if the artifact ships one. 构件若带 provenance JSON，读其中的 `contractVersion`。 */
export function readProvenanceContractVersion(text, siteLabel) {
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return null;
  }
  const candidate = parsed?.contractVersion ?? parsed?.contract?.version;
  if (typeof candidate !== 'string' || candidate.trim() === '') return null;
  return { value: candidate.trim(), site: `${siteLabel} (contractVersion)` };
}

/** `<properties>` keys of an embedded POM. Only the module's own POM is read — a parent is a different artifact. 内嵌 POM 的 `<properties>`；只读模块自己的 POM，父 POM 是另一个构件。 */
export function readPomContractVersion(xml) {
  const block = /<properties>([\s\S]*?)<\/properties>/.exec(xml);
  if (!block) return null;
  for (const key of POM_KEYS) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`<${escaped}>\\s*([^<]+?)\\s*</${escaped}>`).exec(block[1]);
    if (m) return { value: m[1].trim(), site: `embedded pom.xml (<${key}>)` };
  }
  return null;
}

/**
 * Walk the declaration sites in order. `entries` is a Map of zip entry name → text (or undefined for an
 * entry that is not present); the returned `examined` list carries every site with its outcome, so the
 * caller can print what was tried instead of only the verdict.
 *
 * 按顺序遍历声明位置。`entries` 是 zip 条目名 → 文本的 Map（不存在的条目为 undefined）；返回的
 * `examined` 逐条带结果，调用方因此能打印**试过什么**，而不只是结论。
 */
export function findContractVersion(entries) {
  const examined = [];
  const check = (site, present, fn) => {
    if (!present) {
      examined.push({ site, status: 'absent' });
      return null;
    }
    const hit = fn();
    examined.push({ site, status: hit ? 'declared' : 'present, no declaration' });
    return hit;
  };

  const manifestText = entries.get(MANIFEST_ENTRY);
  const fromManifest = check(MANIFEST_ENTRY, Boolean(manifestText), () =>
    readManifestContractVersion(manifestText),
  );
  if (fromManifest) return { found: fromManifest, examined };

  for (const entry of PROPERTIES_ENTRIES) {
    const text = entries.get(entry);
    const hit = check(entry, Boolean(text), () => readPropertiesContractVersion(text, entry));
    if (hit) return { found: hit, examined };
  }

  for (const entry of PROVENANCE_ENTRIES) {
    const text = entries.get(entry);
    const hit = check(entry, Boolean(text), () => readProvenanceContractVersion(text, entry));
    if (hit) return { found: hit, examined };
  }

  const pomNames = [...entries.keys()].filter((n) => /^META-INF\/maven\/.+\/pom\.xml$/.test(n));
  if (pomNames.length === 0) examined.push({ site: 'embedded pom.xml', status: 'absent' });
  for (const name of pomNames) {
    const hit = check(name, true, () => readPomContractVersion(entries.get(name)));
    if (hit) return { found: hit, examined };
  }

  return { found: null, examined };
}

/** `v1.22.0` and `1.22.0` name the same version; whitespace is noise. 两种写法是同一版本；空白不算差异。 */
export function normalizeVersion(value) {
  return String(value ?? '')
    .trim()
    .replace(/^[vV]/, '');
}

export function compareVersions(observed, expected) {
  return normalizeVersion(observed) === normalizeVersion(expected) ? 'match' : 'mismatch';
}

/**
 * Minimal ZIP reader: end-of-central-directory → central directory → local header → inflateRaw. Enough
 * for a Maven artifact, no dependency, and it never trusts the compressed size in the local header
 * (which a streaming zip leaves as zero — the central directory is the authority).
 *
 * 最小 ZIP 读取器：EOCD → 中央目录 → 本地头 → inflateRaw。足够读 Maven 构件、零依赖；压缩大小一律以
 * 中央目录为准，不信任本地头（流式 zip 会在本地头里留 0）。
 */
export function openZip(buffer) {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip archive: no end-of-central-directory record');

  const total = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < total; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`corrupt central directory at entry ${i}`);
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLen);
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }

  const read = (name) => {
    const entry = entries.get(name);
    if (!entry) return null;
    if (entry.compressedSize > MAX_ENTRY_BYTES) {
      throw new Error(`entry ${name} is larger than ${MAX_ENTRY_BYTES} bytes`);
    }
    const at = entry.localOffset;
    if (buffer.readUInt32LE(at) !== 0x04034b50) throw new Error(`corrupt local header for ${name}`);
    const nameLen = buffer.readUInt16LE(at + 26);
    const extraLen = buffer.readUInt16LE(at + 28);
    const start = at + 30 + nameLen + extraLen;
    const raw = buffer.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return raw;
    if (entry.method === 8) return zlib.inflateRawSync(raw);
    throw new Error(`entry ${name} uses unsupported compression method ${entry.method}`);
  };

  return { names: () => [...entries.keys()], read };
}

async function fetchBuffer(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_ARTIFACT_BYTES) throw new Error(`response larger than ${MAX_ARTIFACT_BYTES} bytes: ${url}`);
  return buf;
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--version') opts.version = argv[++i];
    else if (arg === '--expect') opts.expect = argv[++i];
    else if (arg === '--artifact') opts.artifact = argv[++i];
    else if (arg === '--group') opts.group = argv[++i];
    else if (arg === '--repo') opts.repo = argv[++i];
    else if (arg === '--jar') opts.jar = argv[++i];
    else if (arg === '--json') opts.json = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

const USAGE = `Usage: node scripts/check-artifact-contract.mjs --version <artifact-version> --expect <contract-version>
       [--artifact <id>] [--group <groupId>] [--repo <url>] [--jar <local.jar>] [--json]
用法：node scripts/check-artifact-contract.mjs --version <构件版本> --expect <契约版本>
       [--artifact <artifactId>] [--group <groupId>] [--repo <仓库地址>] [--jar <本地 jar>] [--json]`;

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    console.error(USAGE);
    return 2;
  }
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  if (!opts.version || !opts.expect) {
    console.error('✗ --version and --expect are both required / --version 与 --expect 都必填');
    console.error(USAGE);
    return 2;
  }

  const artifact = opts.artifact ?? DEFAULT_ARTIFACT;
  const group = opts.group ?? DEFAULT_GROUP;
  const repo = (opts.repo ?? DEFAULT_REPO).replace(/\/+$/, '');
  const coordinate = `${group}:${artifact}:${opts.version}`;
  const result = {
    coordinate,
    expect: opts.expect,
    source: null,
    sha256: null,
    survivedSha256Check: null,
    declaration: null,
    examined: [],
    verdict: null,
  };

  let jar;
  if (opts.jar) {
    try {
      jar = fs.readFileSync(path.resolve(opts.jar));
    } catch (e) {
      console.error(`✗ cannot read ${opts.jar}: ${e.message}`);
      return 2;
    }
    result.source = `file://${path.resolve(opts.jar)}`;
  } else {
    const url = `${repo}/${group.replace(/\./g, '/')}/${artifact}/${opts.version}/${artifact}-${opts.version}.jar`;
    result.source = url;
    try {
      jar = await fetchBuffer(url);
    } catch (e) {
      console.error(`✗ cannot download ${url}: ${e.message}`);
      console.error('  构件取不到 = 未核验，不是通过 / UNVERIFIED, not a pass');
      return 2;
    }
    result.sha256 = createHash('sha256').update(jar).digest('hex');
    try {
      const published = (await fetchBuffer(`${url}.sha256`)).toString('utf8').trim().split(/\s+/)[0].toLowerCase();
      result.survivedSha256Check = published === result.sha256;
      if (!result.survivedSha256Check) {
        console.error(`✗ SHA-256 mismatch: published ${published}, downloaded ${result.sha256}`);
        console.error('  下载到的字节不是 Central 登记的那份 / the bytes are not the ones Central records');
        return 2;
      }
    } catch (e) {
      // A missing .sha256 is reported, not fatal: the check is evidence, and its absence is a fact. 缺 .sha256 如实报告、不中断。
      result.survivedSha256Check = null;
      result.sha256Note = `no published .sha256 (${e.message})`;
    }
  }

  let zip;
  try {
    zip = openZip(jar);
  } catch (e) {
    console.error(`✗ cannot read the artifact as a jar/zip: ${e.message}`);
    return 2;
  }

  const names = zip.names();
  const decoded = new Map();
  const wanted = [MANIFEST_ENTRY, ...PROPERTIES_ENTRIES, ...PROVENANCE_ENTRIES];
  for (const name of names) {
    if (
      wanted.includes(name) ||
      (/^META-INF\/maven\/.+\/pom\.xml$/.test(name) && !name.includes('pom.xml.sha1'))
    ) {
      try {
        decoded.set(name, zip.read(name).toString('utf8'));
      } catch (e) {
        decoded.set(name, '');
        result.readError = result.readError ?? `${name}: ${e.message}`;
      }
    }
  }

  const { found, examined } = findContractVersion(decoded);
  result.examined = examined;
  result.declaration = found;

  if (opts.json) {
    result.verdict = !found ? 'undeclared' : compareVersions(found.value, opts.expect);
    console.log(JSON.stringify(result, null, 2));
    return found ? (result.verdict === 'match' ? 0 : 1) : 2;
  }

  console.log('[artifact-contract] 构件契约版本核对 / artifact contract-version check');
  console.log(`  构件 / artifact: ${coordinate}`);
  console.log(`  来源 / source:   ${result.source}`);
  console.log(`  jar 条目 / entries: ${names.length}`);
  if (result.sha256) {
    console.log(`  sha256: ${result.sha256}`);
    if (result.survivedSha256Check === true) console.log('  · 与 Central 公布的 .sha256 一致 / matches the published .sha256');
    if (result.survivedSha256Check === null) console.log(`  · ${result.sha256Note}`);
  }
  console.log('');
  console.log('  声明位置 / declaration sites:');
  for (const site of examined) {
    console.log(`    · ${site.site}: ${site.status}`);
  }
  console.log('');

  if (!found) {
    console.error('✗ UNDECLARED —— 构件里没有任何契约版本声明 / the artifact declares no contract version');
    console.error(`  期望 / expected: ${opts.expect}`);
    console.error('  观测 / observed: (none)');
    console.error('  未声明 = 未核验，不是通过 / undeclared is UNVERIFIED, not a pass');
    return 2;
  }

  console.log(`  观测到的契约版本 / observed contract version: ${found.value}`);
  console.log(`  声明于 / declared at: ${found.site}`);
  console.log(`  期望 / expected: ${opts.expect}`);
  console.log('');

  if (compareVersions(found.value, opts.expect) === 'match') {
    console.log('✓ 一致 / match');
    return 0;
  }
  console.error(`✗ 不一致 / MISMATCH —— 构件带的是 ${found.value}，期望 ${opts.expect}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then((code) => process.exit(code));
}
