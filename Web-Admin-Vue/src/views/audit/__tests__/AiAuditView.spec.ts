// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { logsMock, statsMock, verifyMock, interpretationMock, identityChainMock, coverageMock, reviewsMock, objectTypesMock, answersMock, errorMock, successMock, warningMock, showMock, csvMock } = vi.hoisted(() => ({
  logsMock: vi.fn(),
  statsMock: vi.fn(),
  verifyMock: vi.fn(),
  interpretationMock: vi.fn(),
  identityChainMock: vi.fn(),
  coverageMock: vi.fn(),
  reviewsMock: vi.fn(),
  objectTypesMock: vi.fn(),
  answersMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
  warningMock: vi.fn(),
  showMock: vi.fn(),
  csvMock: vi.fn(),
}))

vi.mock('@/api/audit', () => ({
  auditApi: {
    logs: logsMock,
    stats: statsMock,
    verify: verifyMock,
    interpretation: interpretationMock,
    chain: identityChainMock,
    coverage: coverageMock,
    reviews: reviewsMock,
    objectTypes: objectTypesMock,
    answers: answersMock,
  },
}))
// AU-4：会话下钻用 adminApi（元数据 + 正文）；mock 掉避免测试里出现真实网络调用
vi.mock('@/api/admin', () => ({
  adminApi: { aiConversationMeta: vi.fn(), aiConversation: vi.fn() },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock, warning: warningMock, show: showMock }),
}))
vi.mock('@/utils/csv', () => ({ downloadCsv: csvMock }))
// M2 Agent→审计联动（ffe096d）组件读 route.query.agentId，测试需 mock useRoute
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))

import ElementPlus from 'element-plus'
import AiAuditView from '../AiAuditView.vue'

// PageHeader stub：渲染默认插槽，使页头里的「导出」按钮在测试里可点（真 stub 会吞掉插槽）。
// PageHeader stub: renders the default slot so the header's export button is clickable in tests.
const PageHeaderStub = defineComponent({
  name: 'PageHeader',
  template: '<div class="page-header-stub"><slot /></div>',
})

// AppTable stub：渲染 items 的 action 列插槽，让 D2 人类语言标签可断言
const AppTableStub = defineComponent({
  name: 'AppTable',
  props: ['headers', 'items'],
  template:
    '<div class="app-table-stub"><template v-for="item in items" :key="item.id"><slot name="item.action" :item="item" /><slot name="item.reviewed" :item="item" /><slot name="item.expand" :item="item" /></template></div>',
})

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(AiAuditView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: PageHeaderStub,
        AppTable: AppTableStub,
        StatCard: true,
        RangeFilter: true,
        StatusChip: true,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyMock.mockResolvedValue({ valid: true, checked: 0, brokenIndex: null, chain: [] })
  coverageMock.mockResolvedValue(null)
  reviewsMock.mockResolvedValue(null)
  objectTypesMock.mockResolvedValue([])
  interpretationMock.mockResolvedValue(null)
  identityChainMock.mockResolvedValue(null)
})

describe('AiAuditView', () => {
  it('挂载 → 并行调用 auditApi.logs + stats', async () => {
    logsMock.mockResolvedValue([{ id: 1, action: 'query_events', createdAt: '2026-08-20' }])
    statsMock.mockResolvedValue({ totalTokens: 100 })

    mountView()
    await flushPromises()

    expect(logsMock).toHaveBeenCalledWith(expect.objectContaining({ userId: undefined, limit: 50, since: undefined }))
    expect(statsMock).toHaveBeenCalledWith(undefined)
  })

  it('A-8：选「AI 越权/被拒」→ 携带 denied=true 走服务端越权专门视图', async () => {
    logsMock.mockResolvedValue([])
    statsMock.mockResolvedValue({ totalTokens: 100 })

    const wrapper = mountView()
    await flushPromises()
    // 初始 load：主日志查询不带 denied（errorLogs 并行调用是 limit:5 的 isError 查询，用 limit:50 区分）
    expect(logsMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, denied: undefined }))

    // 选择行为类型「denied」→ 点筛选按钮 → load 携带 denied=true
    // The first select is the business-object picker; the behaviour filter is the second.
    // 第一个下拉是业务对象选择器；行为过滤是第二个。
    await wrapper.findAllComponents({ name: 'ElSelect' })[1].vm.$emit('update:modelValue', 'denied')
    await wrapper.find('button.el-button--primary').trigger('click')
    await flushPromises()

    expect(logsMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, denied: 'true' }))
    wrapper.unmount()
  })

  it('U1：导出六问 → 原样写出服务端给的六列（控制台不加列、不改词）', async () => {
    logsMock.mockResolvedValue([])
    statsMock.mockResolvedValue({ totalTokens: 0 })
    const matrix = {
      headers: ['Time (UTC)', 'Action', 'Result', 'Object', 'Authorization', 'Initiated by'],
      rows: [['2026-11-05 10:30:00 UTC', 'Create event', 'Executed', 'Customer #9005', 'Confirmed by alice', 'alice (through the AI assistant)']],
      match: { objectType: 'crm_customer', objectId: 9005, since: null, until: null, count: 1, found: true, truncated: false, statement: '1 matching record.' },
    }
    answersMock.mockResolvedValue(matrix)

    const wrapper = mountView()
    await flushPromises()
    // An object search, because the scope sentence is about object search.
    // 对象检索 —— 口径句说的就是对象检索。
    await wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', 'crm_customer')
    await wrapper.find('input[placeholder="对象 ID"]').setValue('9005')
    await flushPromises()
    await wrapper.find('.page-header-stub button').trigger('click')
    await flushPromises()

    expect(answersMock).toHaveBeenCalledWith(
      expect.objectContaining({ objectType: 'crm_customer', objectId: 9005, limit: 1000 }),
    )
    // The six columns are untouched; the scope sentence rides ahead of the header as a note line.
    // 六列原样不动；口径句作为**列头之前**的一行注释随文件写出。
    expect(csvMock).toHaveBeenCalledWith(
      'audit-six-answers',
      matrix.headers,
      matrix.rows,
      zh.auditObjectScope,
    )
    wrapper.unmount()
  })

  it('U1：对象检索生效时，页面明写它只含已落地的写', async () => {
    logsMock.mockResolvedValue([])
    statsMock.mockResolvedValue({ totalTokens: 0 })

    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).not.toContain(zh.auditObjectScope)

    await wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', 'crm_customer')
    await wrapper.find('input[placeholder="对象 ID"]').setValue('9005')
    await flushPromises()

    expect(wrapper.text()).toContain(zh.auditObjectScope)
    wrapper.unmount()
  })

  it('U1：无匹配 → 说出那句话，不下载一个空文件', async () => {
    logsMock.mockResolvedValue([])
    statsMock.mockResolvedValue({ totalTokens: 0 })
    answersMock.mockResolvedValue({
      headers: [],
      rows: [],
      match: { objectType: 'crm_customer', objectId: 9005, since: null, until: null, count: 0, found: false, truncated: false, statement: 'No matching records for Customer #9005.' },
    })

    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.page-header-stub button').trigger('click')
    await flushPromises()

    expect(showMock).toHaveBeenCalledWith('No matching records for Customer #9005.', 'info')
    expect(csvMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('加载失败 → snackbar.error 提示', async () => {
    logsMock.mockRejectedValue(new Error('审计服务异常'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('审计服务异常')
  })

  it('action 列渲染人类语言标签（D2：actionKey 走 i18n，fallback 到 actionLabel）', async () => {
    logsMock.mockResolvedValue([
      { id: 1, action: 'tool_call', actionKey: 'ai.toolCall', actionLabel: 'AI · Tool call', detail: 'Tool: create_followup_task', createdAt: '2026-08-20', isError: false },
      { id: 2, action: 'chat', actionKey: 'ai.chat', actionLabel: 'AI · Chat', createdAt: '2026-08-20', isError: false },
      { id: 3, action: 'custom_action', actionKey: 'ai.custom_action', actionLabel: 'AI · Custom action', createdAt: '2026-08-20', isError: false },
    ])
    statsMock.mockResolvedValue({ totalTokens: 100 })

    const wrapper = mountView()
    await flushPromises()

    // zh i18n 有条目 → 渲染 i18n 文案
    expect(wrapper.text()).toContain('AI · 工具调用')
    expect(wrapper.text()).toContain('AI · 对话')
    // 未知 actionKey（i18n 无条目）→ fallback 到后端 actionLabel
    expect(wrapper.text()).toContain('AI · Custom action')
    wrapper.unmount()
  })

  // AW-4: the default reading is the business summary; the hash chain is evidence behind an expand.
  it('AW-4: the business summary comes first and hash-chain rows stay collapsed by default', async () => {
    logsMock.mockResolvedValue([])
    statsMock.mockResolvedValue({ totalTokens: 0, byDay: [] })
    verifyMock.mockResolvedValue({
      valid: true,
      checked: 1,
      brokenIndex: null,
      chain: [{ id: 7, action: 'tool_call', prevHash: 'aaaa1111bbbb', hash: 'cccc2222dddd', createdAt: '2026-08-20' }],
    })

    const wrapper = mountView()
    await flushPromises()

    const html = wrapper.html()
    expect(html.indexOf('异常概览')).toBeGreaterThan(-1)
    expect(html.indexOf('审计哈希链')).toBeGreaterThan(html.indexOf('异常概览'))
    // Not rendered at all until the reader asks for it.
    expect(wrapper.text()).not.toContain('#7')
    expect(wrapper.text()).not.toContain('aaaa1111')

    const chainCard = wrapper.findAll('.el-card').find((c) => c.text().includes('审计哈希链'))
    expect(chainCard).toBeTruthy()
    await chainCard!.find('button').trigger('click')

    expect(wrapper.text()).toContain('#7')
    expect(wrapper.text()).toContain('aaaa1111')
    wrapper.unmount()
  })

  it('AW-4: an expanded row leads with the business sentence; the row hash waits in technical detail', async () => {
    logsMock.mockResolvedValue([
      { id: 1, action: 'tool_call', actionKey: 'ai.toolCall', createdAt: '2026-08-20', isError: false },
    ])
    statsMock.mockResolvedValue({ totalTokens: 0, byDay: [] })
    interpretationMock.mockResolvedValue({
      row: { id: 1, hash: 'deadbeefdeadbeef', prevHash: 'cafebabecafebabe' },
      summary: {
        sentence: '张三创建了一个跟进任务',
        key: null,
        businessEvent: null,
        stats: { businessEvents: [], evidence: [], confirmations: { approved: 0, declined: 0 }, blocked: 0, errors: 0 },
      },
      conversation: [],
      state: 'executed',
      effect: null,
      operationAudit: [],
      approval: null,
    })

    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.app-table-stub button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('张三创建了一个跟进任务')
    // Present for the evidence reader, but not visible until the technical detail is expanded.
    // The leaf element carrying the hash must be hidden; on the old view it sat in the timeline.
    const hiddenHash = wrapper
      .findAll('*')
      .find((n) => n.element.children.length === 0 && n.text().includes('deadbeefdead'))
    expect(hiddenHash).toBeTruthy()
    expect(hiddenHash!.isVisible()).toBe(false)
    wrapper.unmount()
  })

  // §7.3: `compensating` is a request, not a restored business record, and the two windows are
  // different uncertainties. Neither may be printed as its raw enum.
  it('AW-4/§7.3: revoke state and window are named, never printed as raw enum values', async () => {
    logsMock.mockResolvedValue([
      { id: 1, action: 'tool_call', actionKey: 'ai.toolCall', createdAt: '2026-08-20', isError: false },
    ])
    statsMock.mockResolvedValue({ totalTokens: 0, byDay: [] })
    interpretationMock.mockResolvedValue({
      row: { id: 1 },
      summary: {
        sentence: '业务摘要',
        key: null,
        businessEvent: null,
        stats: { businessEvents: [], evidence: [], confirmations: { approved: 0, declined: 0 }, blocked: 0, errors: 0 },
      },
      conversation: [],
      state: 'executed',
      effect: {
        id: 3,
        toolName: 'create_event',
        resultType: 'event',
        resultId: 50,
        revokeClass: 'governed_external',
        revokeStatus: 'compensating',
        revokeWindow: 'unacknowledged',
        before: null,
        after: null,
      },
      operationAudit: [],
      approval: null,
    })

    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.app-table-stub button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('外部撤销中')
    expect(wrapper.text()).toContain('可能未到达外部系统')
    expect(wrapper.text()).not.toContain('compensating')
    expect(wrapper.text()).not.toContain('unacknowledged')
    wrapper.unmount()
  })

  it('AW-12：复核列按链上回执区间判定 —— 未复核不得显示为绿色', async () => {
    logsMock.mockResolvedValue([
      { id: 3, action: 'tool_call', createdAt: '2026-08-20', isError: false },
      { id: 4, action: 'audit_review', createdAt: '2026-08-20', isError: false },
      { id: 9, action: 'tool_call', createdAt: '2026-08-20', isError: false },
    ])
    statsMock.mockResolvedValue({ totalTokens: 0 })
    reviewsMock.mockResolvedValue({
      config: { configured: true, owner: 'alice', cadenceDays: 7 },
      reviewedRanges: [{ fromId: 1, throughId: 3 }],
      unreviewedRows: 1,
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('已复核') // id 3 — covered by the receipt
    expect(wrapper.text()).toContain('复核回执') // id 4 — the receipt row itself
    expect(wrapper.text()).toContain('未复核') // id 9 — after the covered range
    expect(wrapper.text()).toContain('复核：alice · 每 7 天')
    wrapper.unmount()
  })

  it('AW-12：复核状态取不到 ⇒ 说「未知」，不冒充「都复核过了」', async () => {
    logsMock.mockResolvedValue([{ id: 9, action: 'tool_call', createdAt: '2026-08-20', isError: false }])
    statsMock.mockResolvedValue({ totalTokens: 0 })
    reviewsMock.mockResolvedValue(null)

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('复核状态未知')
    expect(wrapper.text()).toContain('复核状态取不到')
    expect(wrapper.text()).not.toContain('已复核')
    wrapper.unmount()
  })

  // U2: the approval leg answers "who signed this off" with a name, not only a numeric id — and
  // still falls back to the bare id when the record predates the approver's own decision row.
  // U2：「谁批准」这一腿用姓名回答「谁签的字」，而不只是数字 id —— 早于批准人自己裁决行的记录，
  // 仍回落到纯 id。
  describe('approval leg names the approver', () => {
    function stubWithApproval(approval: Record<string, unknown>) {
      logsMock.mockResolvedValue([
        { id: 1, action: 'tool_call', actionKey: 'ai.toolCall', createdAt: '2026-08-20', isError: false },
      ])
      statsMock.mockResolvedValue({ totalTokens: 0, byDay: [] })
      interpretationMock.mockResolvedValue({
        row: { id: 1 },
        summary: {
          sentence: '业务摘要',
          key: null,
          businessEvent: null,
          stats: { businessEvents: [], evidence: [], confirmations: { approved: 0, declined: 0 }, blocked: 0, errors: 0 },
        },
        conversation: [],
        state: 'executed',
        effect: null,
        operationAudit: [],
        approval,
      })
      return mountView()
    }

    it('有姓名快照 ⇒ 渲染「姓名（#id）」', async () => {
      const wrapper = stubWithApproval({
        token: 'tok-1', toolName: 'create_task', riskLevel: 'R4', kind: 'single', status: 'approved',
        approverId: '2', approverName: 'admin', decidedAt: null, expiresAt: null,
      })
      await flushPromises()
      await wrapper.find('.app-table-stub button').trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('批准人: admin（#2）')
      wrapper.unmount()
    })

    it('无姓名快照（老记录）⇒ 仍显示原 id', async () => {
      const wrapper = stubWithApproval({
        token: 'tok-1', toolName: 'create_task', riskLevel: 'R4', kind: 'single', status: 'approved',
        approverId: '2', approverName: null, decidedAt: null, expiresAt: null,
      })
      await flushPromises()
      await wrapper.find('.app-table-stub button').trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('批准人: 2')
      expect(wrapper.text()).not.toContain('（#2）')
      wrapper.unmount()
    })
  })
})
