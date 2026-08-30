import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'
import HashChainView from '../HashChainView.vue'
import type { HashNode } from '@/types/audit'

function node(id: number, overrides: Partial<HashNode> = {}): HashNode {
  return {
    id,
    createdAt: '2026-08-30T01:00:00.000Z',
    action: 'chat',
    prevHash: id === 1 ? null : `prev-${id}`,
    hash: `hash-${id}`,
    ...overrides,
  }
}

function mountChain(props: { chain: HashNode[]; valid: boolean; checked: number; brokenIndex?: number | null; maxNodes?: number }) {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(HashChainView, { global: { plugins: [i18n] }, props })
}

describe('HashChainView（E-2 哈希链可视化）', () => {
  it('正常链：渲染状态 + 节点 hash 缩写 + action', () => {
    const wrapper = mountChain({ chain: [node(1), node(2)], valid: true, checked: 2 })
    expect(wrapper.text()).toContain('哈希链完整可验证')
    expect(wrapper.text()).toContain('hash-2'.slice(0, 8))
    expect(wrapper.text()).toContain('chat')
  })

  it('断链：断点行标 broken 并显示断链标签', () => {
    const wrapper = mountChain({ chain: [node(1), { ...node(2), broken: true }], valid: false, checked: 1, brokenIndex: 2 })
    expect(wrapper.text()).toContain('哈希链断裂于')
    expect(wrapper.find('.hash-node.is-broken').exists()).toBe(true)
    expect(wrapper.text()).toContain('断链于此')
  })

  it('折叠：chain 超 maxNodes 只显示前 N 条 + 截断提示', () => {
    const wrapper = mountChain({ chain: Array.from({ length: 30 }, (_, i) => node(i + 1)), valid: true, checked: 30, maxNodes: 5 })
    expect(wrapper.findAll('.hash-node')).toHaveLength(5)
    expect(wrapper.text()).toContain('仅显示最近 5 条')
  })

  it('chain 为空：不渲染节点', () => {
    const wrapper = mountChain({ chain: [], valid: true, checked: 0 })
    expect(wrapper.findAll('.hash-node')).toHaveLength(0)
  })
})
