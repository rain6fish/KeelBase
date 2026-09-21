// @vitest-environment node
// SPDX-License-Identifier: Apache-2.0

/**
 * L3 — the golden path, driven by this frontend's own modules, against a live backend.
 *
 * <p>Every other spec in this directory mocks the client and asserts the URL a module builds. Those
 * prove the frontend asks for the right thing; none of them prove a runtime answers it. This one
 * does: it points the real client at a running backend and walks 看能力 → 建客户… → AI 提议写 → 人工
 * 确认 → 审计可验 using the same modules the app uses.
 *
 * <p>It is the level JV-13's design called the only one that actually settles "one frontend, two
 * runtimes" — the earlier levels compared payload shapes, which predicts; this one talks to the
 * thing. Run it against the TypeScript runtime and against the Java runtime and compare.
 *
 * <p><b>Opt-in.</b> It needs a live backend and a token, so it is skipped unless the environment
 * supplies both. A normal `vitest run` is unaffected:
 *
 * <pre>
 *   VITE_API_BASE=http://127.0.0.1:18091/api/v1 \
 *   KEELBASE_GOLDEN_PATH_TOKEN=&lt;token&gt; \
 *   npx vitest run src/api/golden-path.e2e.spec.ts
 * </pre>
 *
 * <p>How the token is obtained is the one documented difference between the runtimes and is
 * deliberately not part of this path: the TypeScript runtime issues one from `/auth/login`, the Java
 * runtime verifies a delegation token minted by the deployment. The sequence after that is meant to
 * be identical.
 *
 * <p><b>Node environment, not jsdom.</b> jsdom enforces CORS on XHR, so against a backend that sends
 * no CORS headers (Spring does not, by default) every request fails as "Network error" before it is
 * ever sent — which would look like a runtime gap and is not one. Under node, axios uses the http
 * adapter and reaches the server. `localStorage` is the only browser thing this path needs, so it
 * gets a minimal shim below rather than a whole DOM.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { storage } from '@/utils/storage'
import { api } from './client'
import { capabilitiesApi } from './capabilities'
import { authApi } from './auth'
import { aiApi } from './ai'
import { aiToolsApi } from './aiTools'
import { auditApi } from './audit'

const BASE = import.meta.env.VITE_API_BASE as string | undefined
const TOKEN = process.env.KEELBASE_GOLDEN_PATH_TOKEN
const enabled = Boolean(BASE && TOKEN && !BASE.startsWith('/'))

// The client reads its token from storage, and storage reads localStorage. This is the only browser
// API the path needs, so it gets a shim rather than a whole DOM. Installed at module scope, before
// any hook runs — and via defineProperty, because node already defines a `localStorage` global
// without `clear`, which the repo's setup calls.
const cells = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
    getItem: (k: string) => cells.get(k) ?? null,
    setItem: (k: string, v: string) => void cells.set(k, v),
    removeItem: (k: string) => void cells.delete(k),
    clear: () => cells.clear(),
    key: (i: number) => [...cells.keys()][i] ?? null,
    get length() {
      return cells.size
    },
  },
})

describe.skipIf(!enabled)('golden path through this frontend', () => {
  // Re-seeded per test, not once: the repo's test setup clears localStorage before every case, so a
  // token saved in beforeAll is gone by the time a request is made.
  beforeEach(() => {
    storage.saveTokens(TOKEN ?? '', '')
  })

  it('1. the shell reads what this runtime offers', async () => {
    const caps = await capabilitiesApi.get()
    expect(caps.preset, 'preset').toBeTruthy()
    expect(Array.isArray(caps.businessModules), 'businessModules is a list').toBe(true)
  })

  it('2. the caller’s capabilities come back in the frozen shape', async () => {
    const perms = await authApi.myPermissions()
    expect(perms.role, 'role').toBeTruthy()
    expect(Array.isArray(perms.resources), 'resources is a list').toBe(true)
    expect(perms.resources[0], 'a capability entry').toHaveProperty('subject')
    expect(perms.resources[0], 'a capability entry').toHaveProperty('scope')
  })

  it('3. asking for a write yields something waiting on a human', async () => {
    const reply = await aiApi.chat({ message: '给客户建一条跟进记录' })
    // The frontend's chat type is a conversation turn: { conversationId, reply, ... }.
    expect(reply.conversationId, 'conversationId').toBeTruthy()
  })

  it('4. the golden path can be walked end to end', async () => {
    // Hops 1 and 2 already passed; this is 3 → 7 with the confirm hop by the shape the app uses.
    const chat = (await api.post('/ai/chat', {
      message: '给客户建一条跟进记录',
      customerId: 1,
    })) as { status?: string; token?: string }
    expect(chat.status, 'a write must wait for a human').toBe('pending_confirmation')
    expect(chat.token, 'and must hand back a token').toBeTruthy()

    const decided = (await api.post(`/ai/confirmations/${chat.token}`, { decision: 'approve' })) as {
      status?: string
      effectId?: number
    }
    expect(decided.status, 'approving executes it').toBe('executed')
    expect(decided.effectId, 'and records a side effect').toBeTruthy()

    const effects = (await aiToolsApi.effects()) as unknown as { items?: Record<string, unknown>[] }
    expect(Array.isArray(effects.items), 'the effects list is paginated').toBe(true)
    // Paginated is not enough: the console renders a row from these, and a runtime that answers with
    // the envelope but not the fields would pass a weaker check and still show blanks.
    const effect = effects.items?.[0]
    expect(effect, 'the effect just created is listed').toBeTruthy()
    for (const field of [
      'id',
      'toolName',
      'conversationId',
      'resultType',
      'resultId',
      'argsHash',
      'createdAt',
      'targetExists',
      'targetSoftDeleted',
      'targetTitle',
    ]) {
      expect(effect, `ToolEffect requires '${field}'`).toHaveProperty(field)
    }

    const verify = (await auditApi.verify()) as { valid?: boolean }
    expect(verify.valid, 'the audit chain verifies').toBe(true)
  })
})
