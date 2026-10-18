// SPDX-License-Identifier: Apache-2.0

/**
 * i18n dictionary consistency guard.
 *
 * Zero dependencies: the dictionaries are plain TypeScript objects and Node's
 * type stripping loads them directly. The shared locale storage key is checked
 * against Front-Flutter's `locale_provider.dart` so the two clients cannot drift.
 *
 * 词典一致性门禁，零依赖：词典是普通 TypeScript 对象，Node 直接剥离类型后加载。
 * 共享的 locale 持久化键与 Front-Flutter 的 `locale_provider.dart` 对账，防止两端漂移。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zh } from '../src/i18n/zh.ts'
import { en } from '../src/i18n/en.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')
const FLUTTER_LOCALE = path.resolve(ROOT, '..', 'Front-Flutter', 'lib', 'core', 'services', 'locale_provider.dart')

/** Keys must be namespaced: `<namespace>.<name>` (dots allowed inside the name). */
const USED_KEY_RE = /\b(?:t|translate)\(\s*'([A-Za-z0-9_]+\.[A-Za-z0-9_.]+)'/g

function sourceFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(vue|ts)$/.test(entry.name) && !full.includes(path.sep + 'i18n' + path.sep)) out.push(full)
  }
  return out
}

/** Raw key lines, used to catch duplicate object keys (which JS would silently drop). */
function declaredKeys(file) {
  return [...fs.readFileSync(file, 'utf8').matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1])
}

const usedKeys = new Map()
for (const file of sourceFiles(SRC)) {
  const text = fs.readFileSync(file, 'utf8')
  for (const match of text.matchAll(USED_KEY_RE)) {
    const key = match[1]
    if (!usedKeys.has(key)) usedKeys.set(key, [])
    usedKeys.get(key).push(path.relative(ROOT, file))
  }
}

test('zh and en declare exactly the same key set', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
})

test('no duplicate keys are silently dropped', () => {
  for (const [locale, file] of [
    ['zh', path.join(SRC, 'i18n', 'zh.ts')],
    ['en', path.join(SRC, 'i18n', 'en.ts')],
  ]) {
    const declared = declaredKeys(file)
    const actual = Object.keys(locale === 'zh' ? zh : en)
    assert.equal(new Set(declared).size, declared.length, `${locale}: duplicate key in source`)
    assert.equal(declared.length, actual.length, `${locale}: source keys do not match loaded object`)
  }
})

test('every value is a non-empty string in both languages', () => {
  for (const [locale, dict] of [
    ['zh', zh],
    ['en', en],
  ]) {
    for (const [key, value] of Object.entries(dict)) {
      assert.equal(typeof value, 'string', `${locale}.${key} is not a string`)
      assert.ok(value.length > 0, `${locale}.${key} is empty`)
    }
  }
})

test('en dictionary values contain no Chinese characters', () => {
  for (const [key, value] of Object.entries(en)) {
    assert.ok(!/\p{Script=Han}/u.test(value), `en.${key} still contains Chinese: ${value}`)
  }
})

test('every t()/translate() key used in src exists in both dictionaries', () => {
  for (const [key, files] of usedKeys) {
    assert.ok(key in zh, `missing in zh: ${key} (used by ${files.join(', ')})`)
    assert.ok(key in en, `missing in en: ${key} (used by ${files.join(', ')})`)
  }
})

test('locale storage key matches Front-Flutter', () => {
  assert.ok(fs.existsSync(FLUTTER_LOCALE), `missing Flutter locale provider: ${FLUTTER_LOCALE}`)
  const flutter = fs.readFileSync(FLUTTER_LOCALE, 'utf8')
  const store = fs.readFileSync(path.join(SRC, 'stores', 'i18n-store.ts'), 'utf8')
  const flutterKey = flutter.match(/_keyLocale\s*=\s*'([^']+)'/)?.[1]
  const taroKey = store.match(/LOCALE_STORAGE_KEY\s*=\s*'([^']+)'/)?.[1]
  assert.ok(flutterKey, 'could not read _keyLocale from Flutter locale_provider.dart')
  assert.ok(taroKey, 'could not read LOCALE_STORAGE_KEY from i18n-store.ts')
  assert.equal(taroKey, flutterKey)
})
