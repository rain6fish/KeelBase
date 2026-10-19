// SPDX-License-Identifier: Apache-2.0

// Tests the Pinia stores against overlapping async responses. The stores are
// written for the Taro bundler, so this harness transpiles their TypeScript and
// replaces the service modules with controllable stubs.
//
// 用可控的迟到响应测试 Pinia store 的竞态。store 面向 Taro 打包器编写，故此处
// 转译其 TypeScript，并把服务模块替换成可控的桩。

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createPinia, setActivePinia } from 'pinia'

const require = createRequire(import.meta.url)
const babel = require('@babel/core')
const presetTypeScript = require.resolve('@babel/preset-typescript')

const serviceStubs = {
  '../services/ai-service':
    'export const aiService = globalThis.__raceStubs.aiService',
  '../services/events-service':
    'export const eventsService = globalThis.__raceStubs.eventsService',
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubSource = serviceStubs[specifier]
    if (stubSource) {
      return {
        url: `data:text/javascript,${encodeURIComponent(stubSource)}`,
        shortCircuit: true,
      }
    }
    // The bundler resolves extensionless relative imports; Node's ESM loader does not.
    if (
      context.parentURL?.endsWith('.ts') &&
      specifier.startsWith('.') &&
      !/\.(m?js|ts|json)$/.test(specifier)
    ) {
      for (const ext of ['.ts', '.mjs', '.js']) {
        const candidate = new URL(specifier + ext, context.parentURL)
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context)
        }
      }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.ts')) {
      const filename = fileURLToPath(url)
      const { code } = babel.transformSync(readFileSync(filename, 'utf8'), {
        filename,
        presets: [presetTypeScript],
        babelrc: false,
        configFile: false,
        sourceType: 'module',
      })
      return { format: 'module', source: code, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})

const aiService = {
  chat: async () => ({ reply: '', conversationId: '' }),
  listConversations: async () => [],
  getConversation: async () => ({ id: '', messages: [] }),
  deleteConversation: async () => {},
}
const eventsService = {
  getEventsForRange: async () => [],
}
globalThis.__raceStubs = { aiService, eventsService }

const { useAiStore } = await import('../src/stores/ai-store.ts')
const { useEventsStore } = await import('../src/stores/events-store.ts')

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function conversation(id, content) {
  return { id, messages: [{ role: 'user', content }] }
}

beforeEach(() => {
  setActivePinia(createPinia())
  aiService.chat = async () => ({ reply: '', conversationId: '' })
  aiService.getConversation = async () => ({ id: '', messages: [] })
  eventsService.getEventsForRange = async () => []
})

test('ai: 后发起的 openConversation 胜出，迟到的旧响应被丢弃', async () => {
  const slowA = deferred()
  const fastB = deferred()
  aiService.getConversation = (id) => (id === 'conv-a' ? slowA.promise : fastB.promise)

  const store = useAiStore()
  const loadA = store.openConversation('conv-a')
  const loadB = store.openConversation('conv-b')

  fastB.resolve(conversation('conv-b', 'B'))
  await loadB
  slowA.resolve(conversation('conv-a', 'A'))
  await loadA

  assert.equal(store.conversationId, 'conv-b')
  assert.deepEqual(store.messages.map((m) => m.content), ['B'])
})

test('ai: 切换会话后，上一会话的迟到回复不得落入新会话', async () => {
  const chat = deferred()
  const opened = deferred()
  aiService.chat = () => chat.promise
  aiService.getConversation = () => opened.promise

  const store = useAiStore()
  const sending = store.send('旧会话的问题')
  const opening = store.openConversation('conv-b')

  opened.resolve(conversation('conv-b', 'B'))
  await opening
  chat.resolve({ reply: '旧会话的回答', conversationId: 'conv-a' })
  await sending

  assert.equal(store.conversationId, 'conv-b')
  assert.deepEqual(store.messages.map((m) => m.content), ['B'])
})

test('ai: clear 之后，迟到的回复不得复活已清空的对话', async () => {
  const chat = deferred()
  aiService.chat = () => chat.promise

  const store = useAiStore()
  const sending = store.send('问题')
  store.clear()
  chat.resolve({ reply: '迟到的回答', conversationId: 'conv-a' })
  await sending

  assert.deepEqual(store.messages, [])
  assert.equal(store.conversationId, null)
  assert.equal(store.isLoading, false)
})

test('ai: 删除当前会话后，迟到的回复不得复活已删除的会话', async () => {
  const chat = deferred()
  aiService.chat = () => chat.promise
  aiService.getConversation = async () => conversation('conv-a', '已有消息')

  const store = useAiStore()
  await store.openConversation('conv-a')
  const sending = store.send('问题')
  await store.deleteConversation('conv-a')
  chat.resolve({ reply: '迟到的回答', conversationId: 'conv-a' })
  await sending

  assert.deepEqual(store.messages, [])
  assert.equal(store.conversationId, null)
})

test('events: 先发起的跨月加载不得覆盖后选中的月份', async () => {
  const january = deferred()
  const february = deferred()
  eventsService.getEventsForRange = (start) =>
    start.startsWith('2026-01') ? january.promise : february.promise

  const store = useEventsStore()
  const loadJanuary = store.loadEvents('2026-01-01', '2026-01-31')
  const loadFebruary = store.loadEvents('2026-02-01', '2026-02-28')

  february.resolve([{ id: 2, title: 'Feb' }])
  await loadFebruary
  january.resolve([{ id: 1, title: 'Jan' }])
  await loadJanuary

  assert.deepEqual(store.events.map((e) => e.id), [2])
  assert.equal(store.isLoading, false)
})
