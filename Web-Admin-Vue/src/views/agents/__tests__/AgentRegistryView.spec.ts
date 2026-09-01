// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { agentsMock, errorMock, successMock } = vi.hoisted(() => ({
  agentsMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
}))

vi.mock('@/api/aiTools', () => ({
  aiToolsApi: { agents: agentsMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))

import ElementPlus from 'element-plus'
import AgentRegistryView from '../AgentRegistryView.vue'

const PageHeaderStub = defineComponent({
  name: 'PageHeader',
  props: ['title', 'subtitle'],
  template: '<div class="page-header-stub" />',
})
const AppIconStub = defineComponent({
  name: 'AppIcon',
  props: ['icon', 'size', 'color'],
  template: '<span class="app-icon-stub" />',
})

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(AgentRegistryView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: PageHeaderStub, AppIcon: AppIconStub },
    },
  })
}

beforeEach(() => {
  agentsMock.mockReset()
})

describe('AgentRegistryView（D5 管理台 Agent 注册表）', () => {
  it('渲染已注册 Agent 列表（名称/拥有者/信任级/用途）', async () => {
    agentsMock.mockResolvedValue([
      {
        id: 1,
        name: 'crm-sales-agent',
        ownerId: 7,
        purpose: 'headless API key「crm-sales-agent」',
        capabilities: '["read_customer","create_followup"]',
        trustLevel: 'R3',
        description: null,
        createdAt: '2026-08-26T00:00:00.000Z',
        updatedAt: '2026-08-26T00:00:00.000Z',
      },
      {
        id: 2,
        name: 'rag-indexer',
        ownerId: null,
        purpose: '知识索引',
        capabilities: null,
        trustLevel: 'R1',
        description: '向量索引 agent',
        createdAt: '2026-08-25T00:00:00.000Z',
        updatedAt: '2026-08-25T00:00:00.000Z',
      },
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('crm-sales-agent')
    expect(wrapper.text()).toContain('#7')
    expect(wrapper.text()).toContain('headless API key「crm-sales-agent」')
    expect(wrapper.text()).toContain('R3')
    expect(wrapper.text()).toContain('rag-indexer')
    expect(wrapper.text()).toContain('R1')
    expect(wrapper.text()).toContain('向量索引 agent')
    // capabilities JSON 解析为能力 chip
    expect(wrapper.text()).toContain('read_customer')
    expect(wrapper.text()).toContain('create_followup')
  })

  it('无记录时显示空态', async () => {
    agentsMock.mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('暂无已注册 Agent')
  })

  it('接口失败显示错误', async () => {
    agentsMock.mockRejectedValue(new Error('network down'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('network down')
  })

  it('capabilities 非法 JSON 容错为空', async () => {
    agentsMock.mockResolvedValue([
      {
        id: 3,
        name: 'bad-cap-agent',
        ownerId: null,
        purpose: null,
        capabilities: '{oops',
        trustLevel: 'R1',
        description: null,
        createdAt: '2026-08-26T00:00:00.000Z',
        updatedAt: '2026-08-26T00:00:00.000Z',
      },
    ])
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('bad-cap-agent')
  })
})
