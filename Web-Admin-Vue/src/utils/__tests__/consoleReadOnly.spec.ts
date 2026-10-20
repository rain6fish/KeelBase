// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import {
  provideConsoleReadOnly,
  useCanEditConsole,
  useConsoleReadOnly,
} from '../consoleReadOnly'

/**
 * Probe standing in for a future console view: it renders a write control only when the injected
 * read-only switch reports write access (C-8). The last case below proves the probe *would*
 * render the control, so the "absent" assertions are falsifiable rather than vacuous.
 *
 * 探针组件代表将来的控制台视图：只有当注入的只读开关报告可写时才渲染写控件（C-8）。
 * 最后一个用例证明探针**会**渲染该控件，因此「不出现」的断言可被证伪、不是空断言。
 */
const ConsoleProbe = defineComponent({
  name: 'ConsoleProbe',
  setup() {
    const readOnly = useConsoleReadOnly()
    const canEdit = useCanEditConsole()
    return () =>
      h('div', [
        h('span', { 'data-test': 'read-only' }, String(readOnly)),
        h('span', { 'data-test': 'can-edit' }, String(canEdit)),
        canEdit ? h('button', { 'data-test': 'write' }, 'write') : null,
      ])
  },
})

/** Explicit provider scope (admin = false, auditor = true) around the probe. */
const ScopedConsoleProbe = defineComponent({
  name: 'ScopedConsoleProbe',
  props: { readOnly: { type: Boolean, required: true } },
  setup(props) {
    provideConsoleReadOnly(props.readOnly)
    return () => h(ConsoleProbe)
  },
})

describe('consoleReadOnly（C-8：注入式只读判据必须 fail-closed）', () => {
  it('无 provider ⇒ 只读为 true、写控件不出现', () => {
    const wrapper = mount(ConsoleProbe)

    expect(wrapper.get('[data-test="read-only"]').text()).toBe('true')
    expect(wrapper.get('[data-test="can-edit"]').text()).toBe('false')
    expect(wrapper.find('[data-test="write"]').exists()).toBe(false)
  })

  it('provider = 只读（审计读者）⇒ 写控件不出现', () => {
    const wrapper = mount(ScopedConsoleProbe, { props: { readOnly: true } })

    expect(wrapper.find('[data-test="write"]').exists()).toBe(false)
  })

  it('provider = 可写（管理员）⇒ 写控件出现（正向对照）', () => {
    const wrapper = mount(ScopedConsoleProbe, { props: { readOnly: false } })
    const write = wrapper.find('[data-test="write"]')

    expect(wrapper.get('[data-test="read-only"]').text()).toBe('false')
    expect(write.exists()).toBe(true)
    expect(write.text()).toBe('write')
  })
})
