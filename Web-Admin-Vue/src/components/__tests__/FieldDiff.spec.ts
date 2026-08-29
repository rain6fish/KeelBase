import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'
import ElementPlus from 'element-plus'
import FieldDiff from '../FieldDiff.vue'

function mountDiff(props: { before?: string | null; after?: string | null }) {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(FieldDiff, { global: { plugins: [ElementPlus, i18n] }, props })
}

describe('FieldDiff（E-1 字段级变更 diff）', () => {
  it('before/after 双空 → 显示无字段变更', () => {
    const wrapper = mountDiff({ before: null, after: null })
    expect(wrapper.text()).toContain('无字段变更')
  })

  it('create 态（无 before）→ 展示 after 全量字段', () => {
    const wrapper = mountDiff({ before: null, after: '{"id":3,"title":"跟进","status":"open"}' })
    expect(wrapper.text()).toContain('跟进')
    expect(wrapper.text()).toContain('open')
    expect(wrapper.text()).toContain('id')
  })

  it('有 before/after → 仅展示差异字段（新值 + 旧值）', () => {
    const wrapper = mountDiff({
      before: '{"title":"跟进","status":"open"}',
      after: '{"title":"跟进","status":"done"}',
    })
    expect(wrapper.text()).toContain('done')
    expect(wrapper.text()).toContain('open')
  })

  it('快照为非法 JSON → 降级显示无字段变更', () => {
    const wrapper = mountDiff({ before: null, after: 'not-json' })
    expect(wrapper.text()).toContain('无字段变更')
  })

  it('敏感字段按掩码值渲染（[REDACTED]）', () => {
    const wrapper = mountDiff({ before: null, after: '{"password":"[REDACTED]"}' })
    expect(wrapper.text()).toContain('[REDACTED]')
  })
})
