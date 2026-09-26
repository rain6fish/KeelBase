// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Locate and parse the Build-side provenance manifest (`.keelbase/manifest.json`).
 *
 * Single-sourced because three readers need the same answer, and the *path convention* is the
 * load-bearing part: the server's cwd is `Server-NestJS/`, so the manifest sits one level up —
 * a caller that guesses wrong gets a silent `null`, not an error. Two copies of that guess
 * already existed; a third would have been a third chance to get it wrong.
 *
 * `present` and `manifest` are reported separately on purpose: a manifest that exists but does not
 * parse is a different fact from one that is not there, and `/app/provenance` distinguishes them.
 *
 * Which keys the manifest carries is not this module's business — it returns what the file says.
 * Callers that need a specific key (`modules`, `searchableModules`) read it and validate the shape
 * themselves, so a hand-edited manifest can never make one caller's expectations silently govern
 * another's.
 *
 * 定位并解析 Build 侧来源清单（`.keelbase/manifest.json`）。
 *
 * 单源，因为有三个读者要同一个答案，而**路径约定**才是承重的那部分：服务进程的 cwd 是
 * `Server-NestJS/`，故清单在上一层 —— 猜错的调用方拿到的是**静默的 `null`**，而不是报错。
 * 这个猜测原本已有两份，第三份就是第三个猜错的机会。
 *
 * `present` 与 `manifest` 分开报是有意的：「存在但解析不了」与「根本不存在」是两回事，
 * `/app/provenance` 至今也是分开报的。
 *
 * 清单里有哪些键**不是本模块的事** —— 文件里写了什么就返回什么。需要特定键（`modules`、
 * `searchableModules`）的调用方自己读、自己校验形状，这样一份手工改过的清单也无法让某个
 * 调用方的预期悄悄支配另一个调用方。
 */
export interface ApplicationManifestRead {
  /** The file exists (even when it cannot be parsed). */
  /* 文件存在（即便解析不了）。 */
  present: boolean;
  /** The parsed object, or `null` when absent or unparsable. */
  /* 解析出的对象；不存在或解析失败时为 `null`。 */
  manifest: Record<string, unknown> | null;
}

export function readApplicationManifest(cwd: string = process.cwd()): ApplicationManifestRead {
  const candidates = [
    resolve(cwd, '../.keelbase/manifest.json'),
    resolve(cwd, '.keelbase/manifest.json'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const parsed: unknown = JSON.parse(readFileSync(p, 'utf8'));
      return {
        present: true,
        manifest:
          parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null,
      };
    } catch {
      return { present: true, manifest: null };
    }
  }
  return { present: false, manifest: null };
}
