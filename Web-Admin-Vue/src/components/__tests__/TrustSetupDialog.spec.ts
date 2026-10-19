// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import zh from '@/i18n/zh'
import en from '@/i18n/en'
import { useAuthStore } from '@/stores/auth'
import { useTrustSetupStore } from '@/stores/trustSetup'
import { STORAGE_KEYS } from '@/utils/constants'
import type { AuthUser } from '@/types/api'
import type { AdminAiTool } from '@/types/admin'

const { listMock, applyPresetMock, toolsMock, policyMock, savePolicyMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  applyPresetMock: vi.fn(),
  toolsMock: vi.fn(),
  policyMock: vi.fn(),
  savePolicyMock: vi.fn(),
}))

vi.mock('@/api/settings', () => ({
  settingsApi: { list: listMock, applyPreset: applyPresetMock, update: vi.fn() },
}))

vi.mock('@/api/aiTools', () => ({
  aiToolsApi: { tools: toolsMock, policy: policyMock, savePolicy: savePolicyMock },
}))

import TrustSetupDialog from '../TrustSetupDialog.vue'

const TOOLS = [
  { name: 'create_event', riskLevel: 'R3', gateMode: 'confirm', enabled: true, allowedRoles: [] },
  { name: 'create_todo', riskLevel: 'R3', gateMode: 'auto', enabled: true, allowedRoles: [] },
  { name: 'send_email', riskLevel: 'R4', gateMode: 'approval', enabled: true, allowedRoles: [] },
  { name: 'delete_everything', riskLevel: 'R5', gateMode: 'blocked', enabled: true, allowedRoles: [] },
  { name: 'web_search', riskLevel: 'R1', gateMode: 'auto', enabled: true, allowedRoles: [] },
] as unknown as AdminAiTool[]

const POLICY = JSON.stringify({
  tools: { create_todo: { allowedRoles: ['admin'] } },
  audit: { granularity: 'all' },
})

function adminUser(role: AuthUser['role']): AuthUser {
  return { id: 1, username: 'admin', email: 'admin@example.com', role }
}

function mountDialog(role: AuthUser['role'] = 'admin') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = adminUser(role)
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  const wrapper = mount(TrustSetupDialog, {
    global: {
      plugins: [pinia, i18n, ElementPlus],
      // el-dialog teleports to body; stub it inline so the wizard is driveable from the wrapper.
      // el-dialog 会 teleport 到 body；stub 成内联便于从 wrapper 驱动。
      stubs: { teleport: true },
    },
  })
  return { wrapper, store: useTrustSetupStore(pinia) }
}

function clickButton(wrapper: ReturnType<typeof mountDialog>['wrapper'], text: string) {
  const button = wrapper.findAll('button').find((b) => b.text().includes(text))
  if (!button) throw new Error(`button not found: ${text}`)
  return button.trigger('click')
}

async function goToSummary(wrapper: ReturnType<typeof mountDialog>['wrapper']) {
  await clickButton(wrapper, '下一步')
  await flushPromises()
  await clickButton(wrapper, '下一步')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  toolsMock.mockResolvedValue(TOOLS)
  policyMock.mockResolvedValue(POLICY)
  savePolicyMock.mockResolvedValue({})
  applyPresetMock.mockResolvedValue({})
})

describe('TrustSetupDialog', () => {
  it('首启自动打开：管理员 + 服务端未记录 preset → 三步齐、当前值可见', async () => {
    listMock.mockResolvedValue([])

    const { wrapper, store } = mountDialog()
    await flushPromises()

    expect(store.visible).toBe(true)
    const text = wrapper.text()
    expect(text).toContain('首次信任配置向导')
    expect(text).toContain('确认规则')
    expect(text).toContain('平台规模')
    expect(text).toContain('审计粒度')
    // R3 current values from the server gateMode (confirm 1 / auto 1), R5 excluded.
    // R3 当前值来自服务端 gateMode（需确认 1 / 自动 1），R5 不计入。
    expect(text).toContain('当前 2 个：自动 1 · 需确认 1 · 需审批 0')
    // R4 current value + audit current value.
    // R4 当前值与审计当前值。
    expect(text).toContain('当前 1 个：自动 0 · 需确认 0 · 需审批 1')
    expect(text).toContain('R5 工具始终阻断')
  })

  it('已选过 preset → 不自动弹出；重入入口打开后仍可查看当前值', async () => {
    listMock.mockResolvedValue([{ key: 'feature_flags_selected', value: 'small', type: 'string' }])

    const { wrapper, store } = mountDialog()
    await flushPromises()
    expect(store.visible).toBe(false)

    store.open()
    await flushPromises()
    // Step 1 is the landing step after every open; walk forward to read the other current values.
    // 每次打开都从第 1 步开始；向后翻页读取其余当前值。
    expect(wrapper.text()).toContain('当前 2 个：自动 1 · 需确认 1 · 需审批 0')
    await clickButton(wrapper, '下一步')
    await flushPromises()
    expect(wrapper.text()).toContain('当前预设：精简版')
    await clickButton(wrapper, '下一步')
    await flushPromises()
    expect(wrapper.text()).toContain('当前审计粒度：全部操作')
  })

  it('非管理员不自动打开', async () => {
    listMock.mockResolvedValue([])

    const { store } = mountDialog('user')
    await flushPromises()

    expect(store.visible).toBe(false)
    expect(listMock).not.toHaveBeenCalled()
  })

  it('成对：跳过 ⇒ 零配置写入（只记本机已看过）', async () => {
    listMock.mockResolvedValue([])

    const { wrapper, store } = mountDialog()
    await flushPromises()
    expect(store.visible).toBe(true)

    await clickButton(wrapper, '跳过，稍后配置')
    await flushPromises()

    expect(savePolicyMock).not.toHaveBeenCalled()
    expect(applyPresetMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(STORAGE_KEYS.TRUST_SETUP_DONE)).toBe('1')
    expect(store.visible).toBe(false)
  })

  it('成对：走完 ⇒ 策略与预设真的提交（保留策略里未触及的维度）', async () => {
    listMock.mockResolvedValue([{ key: 'feature_flags_selected', value: 'full', type: 'string' }])

    const { wrapper, store } = mountDialog()
    await flushPromises()
    store.open()
    await flushPromises()

    // Step 1: set all R3 tools to approval (R4 stays "keep").
    // 第 1 步：R3 工具统一设为需审批（R4 保持当前）。
    const ruleGroups = wrapper.findAllComponents({ name: 'ElRadioGroup' })
    expect(ruleGroups.length).toBe(2)
    ruleGroups[0].vm.$emit('update:modelValue', 'approval')
    await flushPromises()

    // Step 2: choose lite.
    // 第 2 步：选择最小版。
    await clickButton(wrapper, '下一步')
    await flushPromises()
    const liteCard = wrapper.findAll('.preset-card').find((c) => c.text().includes('最小版'))
    expect(liteCard).toBeTruthy()
    await liteCard!.trigger('click')

    // Step 3: audit granularity → write; summary reflects all three changes.
    // 第 3 步：审计粒度改为仅写操作；摘要应列出三项变更。
    await clickButton(wrapper, '下一步')
    await flushPromises()
    const auditGroup = wrapper.findAllComponents({ name: 'ElRadioGroup' })
    expect(auditGroup.length).toBe(1)
    auditGroup[0].vm.$emit('update:modelValue', 'write')
    await flushPromises()

    const summary = wrapper.text()
    expect(summary).toContain('R3 工具统一设为「需审批 (R4 双人)」')
    expect(summary).toContain('审计粒度：全部操作 → 仅写操作')
    expect(summary).toContain('平台规模：最小版')

    await clickButton(wrapper, '保存并完成')
    await flushPromises()

    expect(savePolicyMock).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(savePolicyMock.mock.calls[0][0] as string)
    expect(saved.audit.granularity).toBe('write')
    expect(saved.tools.create_event.mode).toBe('approval')
    expect(saved.tools.create_todo.mode).toBe('approval')
    // The wizard only owns gate mode; an existing allowlist on the same tool survives.
    // 向导只负责门控档位；同一工具上已有的角色白名单原样保留。
    expect(saved.tools.create_todo.allowedRoles).toEqual(['admin'])
    // R4 untouched and R5 never written.
    // R4 未触碰，R5 永不写入。
    expect(saved.tools.send_email).toBeUndefined()
    expect(saved.tools.delete_everything).toBeUndefined()

    expect(applyPresetMock).toHaveBeenCalledWith('lite')
    expect(localStorage.getItem(STORAGE_KEYS.TRUST_SETUP_DONE)).toBe('1')
    expect(store.visible).toBe(false)
  })

  it('成对：没有任何变更 ⇒ 完成按钮不写配置', async () => {
    listMock.mockResolvedValue([{ key: 'feature_flags_selected', value: 'full', type: 'string' }])

    const { wrapper, store } = mountDialog()
    await flushPromises()
    store.open()
    await flushPromises()

    await goToSummary(wrapper)
    expect(wrapper.text()).toContain('没有需要保存的变更')

    await clickButton(wrapper, '完成')
    await flushPromises()

    expect(savePolicyMock).not.toHaveBeenCalled()
    expect(applyPresetMock).not.toHaveBeenCalled()
    expect(store.visible).toBe(false)
  })
})
