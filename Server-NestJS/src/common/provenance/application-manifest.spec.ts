// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readApplicationManifest } from './application-manifest';

/** A throwaway project root; caller removes it. */
/* 一次性的项目根；由调用方移除。 */
function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'keelbase-manifest-'));
}

function writeManifest(root: string, contents: string): void {
  mkdirSync(join(root, '.keelbase'), { recursive: true });
  writeFileSync(join(root, '.keelbase', 'manifest.json'), contents, 'utf8');
}

describe('readApplicationManifest', () => {
  const roots: string[] = [];

  const newRoot = (): string => {
    const root = tempRoot();
    roots.push(root);
    return root;
  };

  afterEach(() => {
    while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  it('缺失 → present:false（非 KeelBase 项目也是合法输入）', () => {
    expect(readApplicationManifest(newRoot())).toEqual({ present: false, manifest: null });
  });

  it('存在且可解析 → present:true + 文件里写了什么就是什么', () => {
    const root = newRoot();
    writeManifest(root, JSON.stringify({ schema: 1, modules: ['books'], searchableModules: ['books'] }));

    expect(readApplicationManifest(root)).toEqual({
      present: true,
      manifest: { schema: 1, modules: ['books'], searchableModules: ['books'] },
    });
  });

  it('存在但不可解析 → present:true 且 manifest:null（与「不存在」不是一回事）', () => {
    const root = newRoot();
    writeManifest(root, 'not-valid-json');

    expect(readApplicationManifest(root)).toEqual({ present: true, manifest: null });
  });

  it('可解析但不是对象 → present:true 且 manifest:null（不把标量当清单）', () => {
    const root = newRoot();
    writeManifest(root, '42');

    expect(readApplicationManifest(root)).toEqual({ present: true, manifest: null });
  });

  it('cwd 是子目录时向上找一层（服务进程的 cwd 是 Server-NestJS/）', () => {
    const root = newRoot();
    writeManifest(root, JSON.stringify({ schema: 1, modules: [] }));
    const nested = join(root, 'Server-NestJS');
    mkdirSync(nested, { recursive: true });

    expect(readApplicationManifest(nested).present).toBe(true);
  });

  it('上一层没有、当前目录有 → 取当前目录（两种部署布局都认）', () => {
    const root = newRoot();
    const nested = join(root, 'Server-NestJS');
    mkdirSync(nested, { recursive: true });
    writeManifest(nested, JSON.stringify({ schema: 1, modules: ['from-cwd'] }));

    const read = readApplicationManifest(nested);
    expect(read.manifest?.modules).toEqual(['from-cwd']);
  });
});
