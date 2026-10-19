// SPDX-License-Identifier: Apache-2.0

/**
 * Build-time env guard: every `process.env.*` read in the Taro source must be defined in `config.env`.
 *
 * Taro's webpack DefinePlugin only replaces the keys listed in `config.env`. A key that is missing from
 * that list survives into the H5 bundle as a bare `process` reference and crashes the page at runtime
 * (`ReferenceError: process is not defined`, reproduced 2026-10-19 for `TARO_APP_API_BASE` /
 * `TARO_APP_WX_TEMPLATE_ID`). This test makes that failure a build-config error instead.
 *
 * 构建期环境守卫：Taro 源码里读取的每个 `process.env.*` 都必须在 `config.env` 里定义。
 *
 * Taro 的 webpack DefinePlugin 只替换 `config.env` 里列出的键。漏掉的键会以裸 `process` 留在 H5
 * 产物中，运行期报 `ReferenceError: process is not defined`（2026-10-19 以 `TARO_APP_API_BASE` /
 * `TARO_APP_WX_TEMPLATE_ID` 复现）。本测试把这类失败提前成构建配置错误。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')
const DIST = path.join(ROOT, 'dist')

/** Supplied by the Taro runner itself, not by this project's config. */
const RUNNER_DEFINED = new Set(['TARO_ENV', 'NODE_ENV'])

function sourceFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(ts|vue)$/.test(entry.name)) out.push(full)
  }
  return out
}

function referencedEnvKeys() {
  const keys = new Set()
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8')
    for (const match of text.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) keys.add(match[1])
  }
  return keys
}

function loadMergedConfig({ env, platform }) {
  const saved = { NODE_ENV: process.env.NODE_ENV, TARO_ENV: process.env.TARO_ENV }
  process.env.NODE_ENV = env
  process.env.TARO_ENV = platform
  for (const id of [
    require.resolve('../config/index.js'),
    require.resolve('../config/dev.js'),
    require.resolve('../config/prod.js'),
  ]) delete require.cache[id]
  try {
    const merge = require('webpack-merge')
    return require('../config/index.js')(merge)
  } finally {
    process.env.NODE_ENV = saved.NODE_ENV
    process.env.TARO_ENV = saved.TARO_ENV
  }
}

test('every process.env key read by the source is defined at build time', () => {
  const merged = loadMergedConfig({ env: 'production', platform: 'h5' })
  const defined = new Set(Object.keys(merged.env || {}))
  const missing = [...referencedEnvKeys()].filter((key) => !defined.has(key) && !RUNNER_DEFINED.has(key))
  assert.deepEqual(missing, [], `config.env must define every process.env key (missing: ${missing.join(', ')})`)
})

test('TARO_APP keys are JSON-encoded strings', () => {
  for (const platform of ['h5', 'weapp']) {
    const merged = loadMergedConfig({ env: 'production', platform })
    for (const [key, value] of Object.entries(merged.env)) {
      if (!key.startsWith('TARO_APP_')) continue
      assert.equal(typeof value, 'string', `${key} (${platform}) must be a JSON string`)
      assert.equal(typeof JSON.parse(value), 'string', `${key} (${platform}) must decode to a string`)
    }
  }
})

test('built bundle does not keep bare process.env references', (t) => {
  const jsDir = path.join(DIST, 'js')
  if (!fs.existsSync(jsDir)) {
    t.skip('dist/js not built; run `npm run build:h5` first')
    return
  }
  const offenders = []
  for (const file of fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'))) {
    const full = path.join(jsDir, file)
    const hits = fs.readFileSync(full, 'utf8').match(/process\.env\.[A-Za-z_]/g) || []
    if (hits.length) offenders.push(`${file}: ${hits.join(', ')}`)
  }
  const chunkDir = path.join(DIST, 'chunk')
  if (fs.existsSync(chunkDir)) {
    for (const file of fs.readdirSync(chunkDir).filter((f) => f.endsWith('.js'))) {
      const full = path.join(chunkDir, file)
      const hits = fs.readFileSync(full, 'utf8').match(/process\.env\.[A-Za-z_]/g) || []
      if (hits.length) offenders.push(`chunk/${file}: ${hits.join(', ')}`)
    }
  }
  assert.deepEqual(offenders, [], `built bundle still contains process.env: ${offenders.join('; ')}`)
})
