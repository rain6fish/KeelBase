// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'
import AiDenialCard from '../AiDenialCard.vue'
import type { AiToolEnd } from '@/utils/streamChat'

/** 服务端 15 类拒绝（`DenialKind`）——文案表必须逐类齐全，缺一类就是线上空白。 */
const KINDS = [
  'risk_r5',
  'tool_disabled',
  'role_denied',
  'feature_disabled',
  'admin_only',
  'destination_denied',
  'field_out_of_domain',
  'field_out_of_bound',
  'approval_missing',
  'destination_changed',
  'agent_read_only',
  'confirmation_timeout',
  'confirmation_invalid',
  'casl_admin',
  'casl_user',
] as const

const r5: AiToolEnd = {
  name: 'delete_customer',
  success: false,
  error: 'Blocked by policy',
  explanation: {
    deniedBy: 'risk_policy',
    reasonKey: 'ai.deny.risk_r5.reason',
    nextStepKey: 'ai.deny.risk_r5.nextStep',
    reason: 'server zh reason',
    nextStep: 'server zh next step',
    params: { tool: 'delete_customer' },
  },
}

function mountCard(locale: 'zh' | 'en', toolEnd: AiToolEnd = r5) {
  const i18n = createI18n({ legacy: false, locale, messages: { zh, en } })
  return mount(AiDenialCard, { props: { toolEnd }, global: { plugins: [ElementPlus, i18n] } })
}

describe('AiDenialCard · 拒绝指引', () => {
  it('i18n 文案表覆盖全部 15 类拒绝，且中英 key 集合一致', () => {
    expect(Object.keys(zh.ai.deny).sort()).toEqual(Object.keys(en.ai.deny).sort())
    for (const kind of KINDS) {
      expect(zh.ai.deny[kind].reason, `zh ${kind}.reason`).toBeTruthy()
      expect(zh.ai.deny[kind].nextStep, `zh ${kind}.nextStep`).toBeTruthy()
      expect(en.ai.deny[kind].reason, `en ${kind}.reason`).toBeTruthy()
      expect(en.ai.deny[kind].nextStep, `en ${kind}.nextStep`).toBeTruthy()
    }
  })

  it('中文：按 reasonKey/nextStepKey 渲染并用 params 插值', () => {
    const wrapper = mountCard('zh')
    expect(wrapper.text()).toContain('风险策略（R5）')
    expect(wrapper.text()).toContain('工具「delete_customer」的风险级为 R5')
    expect(wrapper.text()).toContain('请改用可逆的低风险工具')
    // 服务端已本地化文案只是兜底，不被优先使用
    expect(wrapper.text()).not.toContain('server zh reason')
  })

  it('英文：同一 key 渲染英文，且切换语言无需回服务端', () => {
    const wrapper = mountCard('en')
    expect(wrapper.text()).toContain('Risk policy (R5)')
    expect(wrapper.text()).toContain('Tool "delete_customer" is risk level R5')
    expect(wrapper.text()).toContain('Use a reversible lower-risk tool')
    expect(wrapper.text()).not.toContain('server zh reason')
  })

  it('key 缺失时回落到服务端已本地化文案（不渲染空行）', () => {
    const wrapper = mountCard('zh', {
      name: 'legacy_tool',
      success: false,
      explanation: {
        deniedBy: 'governance',
        reasonKey: 'ai.deny.not_in_catalogue.reason',
        nextStepKey: 'ai.deny.not_in_catalogue.nextStep',
        reason: '服务端兜底原因',
        nextStep: '服务端兜底下一步',
      },
    })
    expect(wrapper.text()).toContain('服务端兜底原因')
    expect(wrapper.text()).toContain('服务端兜底下一步')
  })
})
