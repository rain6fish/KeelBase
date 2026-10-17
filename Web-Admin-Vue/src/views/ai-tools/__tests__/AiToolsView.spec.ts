// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { toolsMock, policyMock, savePolicyMock, effectsMock, revokeMock, claimMock, ackMock, errorMock, successMock, warningMock } = vi.hoisted(() => ({
  toolsMock: vi.fn(),
  policyMock: vi.fn(),
  savePolicyMock: vi.fn(),
  effectsMock: vi.fn(),
  revokeMock: vi.fn(),
  claimMock: vi.fn(),
  ackMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
  warningMock: vi.fn(),
}))

vi.mock('@/api/aiTools', () => ({
  aiToolsApi: {
    tools: toolsMock,
    policy: policyMock,
    savePolicy: savePolicyMock,
    effects: effectsMock,
    revokeEffect: revokeMock,
    claimEffect: claimMock,
    acknowledgeDispute: ackMock,
  },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock, warning: warningMock }),
}))

// AW-2: the view reads `auth.isAdmin`; default to admin so the existing effects-path assertions still
// exercise the admin UI, and flip it to test the auditor's read-only rendering.
// AW-2：视图读 `auth.isAdmin`；默认 admin 让既有副作用路径断言照旧，翻转后测审计读者的只读渲染。
const authState = vi.hoisted(() => ({ isAdmin: true, isAuditor: false }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))

import ElementPlus from 'element-plus'
import AiToolsView from '../AiToolsView.vue'

const AppTableStub = defineComponent({
  name: 'AppTable',
  props: ['headers', 'items', 'loading', 'total', 'itemsPerPage'],
  // Render the three slots the assertions actually depend on: actions (buttons), targetTitle
  // (the REV-7/10/11/13 readings) and status (the status chip and the REV-2 window readings).
  // Without any of them the assertions would pass or fail on something that never rendered.
  // 渲染**被测断言所依赖的**三个插槽：actions（按钮）、targetTitle（REV-7/10/11/13 的读数）与
  // status（状态 chip 与 REV-2 窗口读数）。少了任何一个，断言就会在「根本没渲染」的情况下通过或失败，
  // 测的就不是它们要说的事。
  template:
    '<div class="app-table-stub"><template v-for="item in items" :key="item.id">' +
    '<div class="row-stub" :data-id="item.id">' +
    '<div class="cell-title"><slot name="item.targetTitle" :item="item" /></div>' +
    '<div class="cell-status"><slot name="item.status" :item="item" /></div>' +
    '<div class="cell-actions"><slot name="item.actions" :item="item" /></div>' +
    '</div>' +
    '</template></div>',
})
/** StatusChip stub: renders labelMap as text so assertions read the word the reader actually sees.
 * StatusChip 桩：把 labelMap 渲染成文本，让断言读得到「读者实际看到的是哪个词」 */
const StatusChipStub = defineComponent({
  name: 'StatusChip',
  props: ['status', 'labelMap', 'colorMap'],
  template: '<span class="chip" :data-status="status">{{ labelMap?.[status] ?? status }}</span>',
})
const ConfirmDialogStub = defineComponent({
  name: 'ConfirmDialog',
  props: ['modelValue', 'title', 'content'],
  emits: ['confirm', 'update:modelValue'],
  template:
    '<div class="confirm-stub" v-if="modelValue"><button class="confirm-btn" @click="$emit(\'confirm\')">confirm</button></div>',
})

const tool = {
  name: 'create_event',
  description: '创建事件',
  parameters: [{ name: 'title', type: 'string', required: true }],
  enabled: true,
  requiresConfirmation: true,
  allowedRoles: ['user'],
  riskLevel: 'R3',
  riskStrategy: 'confirmation',
  permissions: null,
}

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(AiToolsView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: true,
        AppTable: AppTableStub,
        AppPagination: true,
        StatusChip: StatusChipStub,
        ConfirmDialog: ConfirmDialogStub,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.isAdmin = true
  authState.isAuditor = false
})

describe('AiToolsView', () => {
  it('挂载 → 加载工具清单 + 副作用（治理策略编辑已收敛至策略中心）', async () => {
    toolsMock.mockResolvedValue([tool])
    effectsMock.mockResolvedValue({ total: 0, page: 1, limit: 20, items: [] })

    mountView()
    await flushPromises()

    expect(toolsMock).toHaveBeenCalledTimes(1)
    expect(policyMock).not.toHaveBeenCalled()
    expect(effectsMock).toHaveBeenCalledWith(undefined, 1, 20)
  })

  it('auditor 只读：工具清单照读，内容安全与副作用账本不渲染也不请求', async () => {
    authState.isAdmin = false
    toolsMock.mockResolvedValue([tool])

    const wrapper = mountView()
    await flushPromises()

    expect(toolsMock).toHaveBeenCalledTimes(1)
    expect(effectsMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('create_event')
    expect(wrapper.text()).not.toContain('内容安全')
    expect(wrapper.find('.app-table-stub').exists()).toBe(false)
  })

  it('加载失败 → snackbar.error 提示', async () => {
    toolsMock.mockRejectedValue(new Error('工具服务异常'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('工具服务异常')
  })

  it('撤销副作用确认 → revokeEffect(id) + success + 刷新', async () => {
    toolsMock.mockResolvedValue([tool])
    effectsMock.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 20,
      items: [
        { id: 9, toolName: 'create_event', conversationId: null, resultType: 'event', resultId: 100, argsHash: 'h', createdAt: '2026-08-21', targetExists: true, targetSoftDeleted: false, targetTitle: '周会', status: 'executed', revokeClass: 'local_compensate', revocable: true },
      ],
    })
    revokeMock.mockResolvedValue({ revoked: true, effectId: 9 })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.app-table-stub .el-button--danger').trigger('click')
    await flushPromises()
    expect(wrapper.find('.confirm-stub').exists()).toBe(true)

    await wrapper.find('.confirm-stub .confirm-btn').trigger('click')
    await flushPromises()

    expect(revokeMock).toHaveBeenCalledWith(9)
    expect(successMock).toHaveBeenCalledWith('已下线')
    expect(effectsMock).toHaveBeenCalledTimes(2)
  })

  /** REV-11：滞留且无人接手 ⇒ 可认领；认领是记录事实（谁接手了），不是前端自己算的 */
  it('需认领的行显示认领钮 → claimEffect(id) + success + 刷新', async () => {
    toolsMock.mockResolvedValue([tool])
    effectsMock.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 20,
      items: [
        { id: 11, toolName: 'proxy_send', conversationId: null, resultType: 'proxy_call', resultId: 7, argsHash: 'h', createdAt: '2026-09-01', targetExists: true, targetSoftDeleted: false, targetTitle: '外部写', status: 'revoking_external', revokeClass: 'governed_external', revocable: false, revokeNeedsClaim: true },
      ],
    })
    claimMock.mockResolvedValue({ outcome: 'claimed', claimedBy: '7' })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.app-table-stub .el-button--warning').trigger('click')
    await flushPromises()

    expect(claimMock).toHaveBeenCalledWith(11)
    expect(successMock).toHaveBeenCalledWith('已认领——这条记在你名下')
    expect(effectsMock).toHaveBeenCalledTimes(2)
  })

  it('认领被拒（已被他人认领）→ **warning 而不是 success**（服务端分种类，前端不压成一句「失败」也不谎报成功）', async () => {
    toolsMock.mockResolvedValue([tool])
    effectsMock.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 20,
      items: [
        { id: 11, toolName: 'proxy_send', conversationId: null, resultType: 'proxy_call', resultId: 7, argsHash: 'h', createdAt: '2026-09-01', targetExists: true, targetSoftDeleted: false, targetTitle: '外部写', status: 'revoking_external', revokeClass: 'governed_external', revocable: false, revokeNeedsClaim: true },
      ],
    })
    claimMock.mockResolvedValue({ outcome: 'already_claimed', claimedBy: '9' })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.app-table-stub .el-button--warning').trigger('click')
    await flushPromises()

    expect(warningMock).toHaveBeenCalledWith('已被他人认领')
    expect(successMock).not.toHaveBeenCalled()
  })

  /** ARC-6：有争议且**尚未确认** ⇒ 可确认；已确认的不再显示（反向对照） */
  it('未确认的争议显示确认钮 → acknowledgeDispute(id) + success + 刷新', async () => {
    toolsMock.mockResolvedValue([tool])
    effectsMock.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 20,
      items: [
        { id: 12, toolName: 'create_project_with_tasks', conversationId: null, resultType: 'pm_project', resultId: 3, argsHash: 'h', createdAt: '2026-09-01', targetExists: true, targetSoftDeleted: false, targetTitle: '项目', status: 'executed', revokeClass: 'local_compensate', revocable: false, disputed: true, dispute: { declared: [], stored: [], onlyDeclared: [], onlyStored: [], decidedAt: '2026-09-01T00:00:00Z' } },
      ],
    })
    ackMock.mockResolvedValue({ acknowledgedAt: '2026-09-28T00:00:00Z' })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.app-table-stub .el-button--info').trigger('click')
    await flushPromises()

    expect(ackMock).toHaveBeenCalledWith(12)
    expect(successMock).toHaveBeenCalledWith('已确认——该组不再读作未了结（证据仍在）')
  })

  /** REV-10：账上没有的写**在写时就看得见**，不必等撤销时才发现 */
  it('有「账上没有的写」的行把它渲染出来（主键未知时给 ?，不编一个假 id）', async () => {
    toolsMock.mockResolvedValue([tool])
    effectsMock.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 20,
      items: [
        { id: 13, toolName: 'create_event', conversationId: null, resultType: 'event', resultId: 100, argsHash: 'h', createdAt: '2026-09-28', targetExists: true, targetSoftDeleted: false, targetTitle: '周会', status: 'executed', revokeClass: 'local_compensate', revocable: true, undeclaredWrites: [{ entity: 'CrmTask', id: 9, kind: 'insert' }, { entity: 'Todo', id: null, kind: 'insert' }] },
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('有 2 处写没有登记')
    expect(text).toContain('CrmTask#9')
    expect(text).toContain('Todo#?') // 主键未知 ⇒ 给 ?，不编数字
  })

  it('反向对照：没有该读数的行不渲染这一块', async () => {
    toolsMock.mockResolvedValue([tool])
    effectsMock.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 20,
      items: [
        { id: 14, toolName: 'create_event', conversationId: null, resultType: 'event', resultId: 101, argsHash: 'h', createdAt: '2026-09-28', targetExists: true, targetSoftDeleted: false, targetTitle: '周会', status: 'executed', revokeClass: 'local_compensate', revocable: true },
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).not.toContain('写没有登记')
  })

  it('反向对照：已确认过的争议**不再**显示确认钮（且不显示认领钮）', async () => {
    toolsMock.mockResolvedValue([tool])
    effectsMock.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 20,
      items: [
        { id: 12, toolName: 'create_project_with_tasks', conversationId: null, resultType: 'pm_project', resultId: 3, argsHash: 'h', createdAt: '2026-09-01', targetExists: true, targetSoftDeleted: false, targetTitle: '项目', status: 'executed', revokeClass: 'local_compensate', revocable: false, disputed: true, dispute: { declared: [], stored: [], onlyDeclared: [], onlyStored: [], decidedAt: '2026-09-01T00:00:00Z', acknowledgedAt: '2026-09-02T00:00:00Z', acknowledgedBy: '7' } },
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.app-table-stub .el-button--info').exists()).toBe(false)
    expect(wrapper.find('.app-table-stub .el-button--warning').exists()).toBe(false)
  })

  /**
   * REV-1: a disputed group's status is not the green "active" chip — when the two ledgers disagree,
   * a green OK reads the disagreement as "all fine". This asserts the reader's primary reading, not
   * the existence of a branch.
   *
   * REV-1：争议组的「状态」不是 green 的「进行中」——两本账在打架时，绿色的 OK 是把
   * 「声明与持有不一致」读成了「一切正常」。这条测的是**读者看到的主读数**，不是分支存在。
   */
  it('未确认的争议 → 状态列读作「有争议」，而不是绿色的「进行中」', async () => {
    toolsMock.mockResolvedValue([tool])
    effectsMock.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 20,
      items: [
        { id: 15, toolName: 'create_project_with_tasks', conversationId: null, resultType: 'pm_project', resultId: 3, argsHash: 'h', createdAt: '2026-09-01', targetExists: true, targetSoftDeleted: false, targetTitle: '项目', status: 'executed', revokeClass: 'local_compensate', revocable: false, disputed: true, dispute: { declared: [], stored: [], onlyDeclared: [], onlyStored: [], decidedAt: '2026-09-01T00:00:00Z' } },
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    const status = wrapper.find('.row-stub .cell-status').text()
    expect(status).toContain('有争议')
    expect(status).not.toContain('进行中')
  })

  /**
   * ARC-6: acknowledging does not erase the dispute — it only records that a human looked and
   * accepted the evidence. The dispute must stay visible afterwards, naming who acknowledged it and when.
   *
   * ARC-6：确认不是「争议消失了」，只是「有人看过并接受了证据」。确认后必须仍然看得见，
   * 且要说清是谁、何时确认的。
   */
  it('已确认的争议 → 状态列仍显示该争议（谁在何时确认，证据保留）', async () => {
    toolsMock.mockResolvedValue([tool])
    effectsMock.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 20,
      items: [
        { id: 16, toolName: 'create_project_with_tasks', conversationId: null, resultType: 'pm_project', resultId: 3, argsHash: 'h', createdAt: '2026-09-01', targetExists: true, targetSoftDeleted: false, targetTitle: '项目', status: 'executed', revokeClass: 'local_compensate', revocable: false, disputed: false, dispute: { declared: [], stored: [], onlyDeclared: [], onlyStored: [], decidedAt: '2026-09-01T00:00:00Z', acknowledgedAt: '2026-09-02T00:00:00Z', acknowledgedBy: '7' } },
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    const status = wrapper.find('.row-stub .cell-status').text()
    expect(status).toContain('有争议')
    expect(status).toContain('已确认')
    expect(status).not.toContain('进行中')
  })

  /**
   * REV-2 refinement: one "external revoke pending" splits into two windows — "may never have
   * arrived" and "arrived, no answer" are different uncertainties. They used to render as the same
   * sentence on the row (visually indistinguishable); this asserts the two values produce different readings.
   *
   * REV-2 细化：同一条「外部撤销中」再分两窗——「可能没到达」与「到达了但没回音」是两种不确定性。
   * 它们此前在行上渲染成同一句话（外观不可分），这条测的是**两种取值产生不同读数**。
   */
  it('revokeWindow 的两个取值在行上产生可区分的读数（unacknowledged ≠ awaiting_target）', async () => {
    toolsMock.mockResolvedValue([tool])
    effectsMock.mockResolvedValue({
      total: 2,
      page: 1,
      limit: 20,
      items: [
        { id: 17, toolName: 'proxy_send', conversationId: null, resultType: 'proxy_call', resultId: 7, argsHash: 'h', createdAt: '2026-09-01', targetExists: true, targetSoftDeleted: false, targetTitle: '外部写 A', status: 'revoking_external', revokeClass: 'governed_external', revocable: false, revokeStatus: 'compensating', revokeWindow: 'unacknowledged' },
        { id: 18, toolName: 'proxy_send', conversationId: null, resultType: 'proxy_call', resultId: 8, argsHash: 'h', createdAt: '2026-09-01', targetExists: true, targetSoftDeleted: false, targetTitle: '外部写 B', status: 'revoking_external', revokeClass: 'governed_external', revocable: false, revokeStatus: 'compensating', revokeWindow: 'awaiting_target' },
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    const rows = wrapper.findAll('.row-stub')
    expect(rows).toHaveLength(2)
    const unacknowledged = rows[0].text()
    const awaitingTarget = rows[1].text()
    expect(unacknowledged).toContain('可能未到达外部系统')
    expect(awaitingTarget).toContain('已到达，外部系统尚无终态')
    expect(unacknowledged).not.toBe(awaitingTarget)
  })
})
