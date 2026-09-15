#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 极简 CLI 参数解析（零依赖，脚本共用）。
 *
 * 支持：位置参数 + `--k v` / `--k=v` / 裸 `--k`（值为 true）。
 * 保持既有「<pkg> --key <k>」位置用法——`positional[0]` 即文件参数。
 */
export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (typeof a === 'string' && a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) { flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const next = argv[i + 1];
      if (next !== undefined && !String(next).startsWith('--')) { flags[a.slice(2)] = next; i++; }
      else flags[a.slice(2)] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

/** `--key a,b` → ['a','b']（缺省/裸 `--key` → []）。 */
export function keysFromFlags(flags) {
  return flags.key === true || flags.key === undefined ? [] : String(flags.key).split(',').filter(Boolean);
}

/** `--lang zh|en` → 'zh' | 'en' | 'both'。 */
export function langFromFlags(flags) {
  return flags.lang === 'zh' || flags.lang === 'en' ? flags.lang : 'both';
}
