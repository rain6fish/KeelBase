import { describe, expect, it, vi, beforeEach } from 'vitest'

const { api } = vi.hoisted(() => {
  return { api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

// 所有 api 模块都复用统一 client：mock 掉 get/post/put/patch/delete。
// import.ts / knowledge.ts 直接用默认导出 instance，同样指向同一 mock。
vi.mock('@/api/client', () => ({ api, default: api }))

import { adminApi } from './admin'
import { aiEvalApi } from './aiEval'
import { aiToolsApi } from './aiTools'
import { aiTraceApi } from './aiTrace'
import { approvalApi } from './approval'
import { auditApi } from './audit'
import { authApi } from './auth'
import { capabilitiesApi } from './capabilities'
import { contractsApi } from './contracts'
import { crmApi } from './crm'
import { eventsApi } from './events'
import { importApi } from './import'
import { knowledgeApi } from './knowledge'
import { mcpApi } from './mcp'
import { notesApi } from './notes'
import { orgApi } from './org'
import { pmApi } from './pm'
import { suppliersApi } from './suppliers'
import { tagsApi } from './tags'
import { templatesApi } from './templates'
import { usersApi } from './users'
import { workbenchApi } from './workbench'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('authApi', () => {
  it('login POST /auth/login', async () => {
    api.post.mockResolvedValue({})
    await authApi.login('alex', '123456')
    expect(api.post).toHaveBeenCalledWith('/auth/login', { username: 'alex', password: '123456' })
  })

  it('me GET /auth/me', async () => {
    api.get.mockResolvedValue({})
    await authApi.me()
    expect(api.get).toHaveBeenCalledWith('/auth/me')
  })

  it('logout POST /auth/logout', async () => {
    api.post.mockResolvedValue(null)
    await authApi.logout()
    expect(api.post).toHaveBeenCalledWith('/auth/logout')
  })
})

describe('capabilitiesApi', () => {
  it('get GET /app/capabilities', async () => {
    api.get.mockResolvedValue({ preset: 'full', features: {}, businessModules: [] })
    const caps = await capabilitiesApi.get()
    expect(api.get).toHaveBeenCalledWith('/app/capabilities')
    expect(caps.preset).toBe('full')
  })
})

describe('adminApi', () => {
  it('monitorSummary GET', async () => {
    api.get.mockResolvedValue({})
    await adminApi.monitorSummary()
    expect(api.get).toHaveBeenCalledWith('/admin/monitor/summary')
  })

  it('opsSummary GET', async () => {
    api.get.mockResolvedValue({})
    await adminApi.opsSummary()
    expect(api.get).toHaveBeenCalledWith('/admin/ops/summary')
  })

  it('overview 带默认 days', async () => {
    api.get.mockResolvedValue({})
    await adminApi.overview()
    expect(api.get).toHaveBeenCalledWith('/admin/overview', { days: 7 })
    await adminApi.overview(30)
    expect(api.get).toHaveBeenCalledWith('/admin/overview', { days: 30 })
  })

  it('sessions GET /admin/sessions', async () => {
    api.get.mockResolvedValue([])
    await adminApi.sessions()
    expect(api.get).toHaveBeenCalledWith('/admin/sessions')
  })

  it('revokeSession DELETE /admin/sessions/:id', async () => {
    api.delete.mockResolvedValue(null)
    await adminApi.revokeSession(3)
    expect(api.delete).toHaveBeenCalledWith('/admin/sessions/3')
  })

  it('broadcast POST 带 payload', async () => {
    api.post.mockResolvedValue({ sent: 2 })
    await adminApi.broadcast({ title: '公告', userIds: [1, 2] })
    expect(api.post).toHaveBeenCalledWith('/admin/notifications/broadcast', { title: '公告', userIds: [1, 2] })
  })

  it('appVersion GET /app/version', async () => {
    api.get.mockResolvedValue({})
    await adminApi.appVersion()
    expect(api.get).toHaveBeenCalledWith('/app/version')
  })

  it('trash 分页参数', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    await adminApi.trash(2, 50)
    expect(api.get).toHaveBeenCalledWith('/admin/trash', { page: 2, limit: 50 })
  })

  it('restoreTrash POST 带 type/id', async () => {
    api.post.mockResolvedValue({ restored: true })
    await adminApi.restoreTrash('event', 7)
    expect(api.post).toHaveBeenCalledWith('/admin/trash/event/7/restore')
  })

  it('analytics 带默认 days', async () => {
    api.get.mockResolvedValue({})
    await adminApi.analytics()
    expect(api.get).toHaveBeenCalledWith('/admin/analytics', { days: 30 })
  })
})

describe('aiEvalApi', () => {
  it('listCases GET', async () => {
    api.get.mockResolvedValue([])
    await aiEvalApi.listCases()
    expect(api.get).toHaveBeenCalledWith('/ai/eval/cases')
  })

  it('createCase POST 带 payload', async () => {
    api.post.mockResolvedValue({})
    await aiEvalApi.createCase({ category: 'code', prompt: 'x' })
    expect(api.post).toHaveBeenCalledWith('/ai/eval/cases', { category: 'code', prompt: 'x' })
  })

  it('removeCase DELETE 带 id', async () => {
    api.delete.mockResolvedValue({ deleted: true })
    await aiEvalApi.removeCase(5)
    expect(api.delete).toHaveBeenCalledWith('/ai/eval/cases/5')
  })

  it('seed / run / report', async () => {
    api.post.mockResolvedValue({})
    await aiEvalApi.seed()
    expect(api.post).toHaveBeenCalledWith('/ai/eval/seed')
    await aiEvalApi.run()
    expect(api.post).toHaveBeenCalledWith('/ai/eval/run')
    api.get.mockResolvedValue(null)
    await aiEvalApi.report()
    expect(api.get).toHaveBeenCalledWith('/ai/eval/report')
  })
})

describe('aiToolsApi', () => {
  it('tools GET /ai/tools', async () => {
    api.get.mockResolvedValue([])
    await aiToolsApi.tools()
    expect(api.get).toHaveBeenCalledWith('/ai/tools')
  })

  it('effects 默认分页', async () => {
    api.get.mockResolvedValue({ items: [] })
    await aiToolsApi.effects()
    expect(api.get).toHaveBeenCalledWith('/ai/tool-effects', { page: 1, limit: 20 })
  })

  it('effects 带 userId 过滤', async () => {
    api.get.mockResolvedValue({ items: [] })
    await aiToolsApi.effects(9)
    expect(api.get).toHaveBeenCalledWith('/ai/tool-effects', { userId: 9, page: 1, limit: 20 })
  })

  it('revokeEffect DELETE 带 id', async () => {
    api.delete.mockResolvedValue({ revoked: true, effectId: 1 })
    await aiToolsApi.revokeEffect(1)
    expect(api.delete).toHaveBeenCalledWith('/ai/tool-effects/1')
  })

  it('policy GET /ai/governance/policy 返回 JSON 字符串', async () => {
    api.get.mockResolvedValue({ tools: {}, audit: { granularity: 'all' } })
    const v = await aiToolsApi.policy()
    expect(api.get).toHaveBeenCalledWith('/ai/governance/policy')
    expect(JSON.parse(v as string)).toEqual({ tools: {}, audit: { granularity: 'all' } })
  })

  it('savePolicy PUT /ai/governance/policy', async () => {
    api.put.mockResolvedValue({})
    await aiToolsApi.savePolicy('{"tools":{}}')
    expect(api.put).toHaveBeenCalledWith('/ai/governance/policy', { tools: {} })
  })
})

describe('aiTraceApi', () => {
  it('conversations GET', async () => {
    api.get.mockResolvedValue([])
    await aiTraceApi.conversations()
    expect(api.get).toHaveBeenCalledWith('/ai/conversations')
  })

  it('trace GET 带 id', async () => {
    api.get.mockResolvedValue({ conversation: {}, steps: [] })
    await aiTraceApi.trace('c1')
    expect(api.get).toHaveBeenCalledWith('/ai/conversations/c1/trace')
  })

  it('revokeEffect DELETE 本人副作用', async () => {
    api.delete.mockResolvedValue({ revoked: true, effectId: 4 })
    await aiTraceApi.revokeEffect(4)
    expect(api.delete).toHaveBeenCalledWith('/ai/my/tool-effects/4')
  })
})

describe('approvalApi', () => {
  it('requests 带分页参数', async () => {
    api.get.mockResolvedValue({ items: [] })
    await approvalApi.requests({ page: 1 })
    expect(api.get).toHaveBeenCalledWith('/approval/requests', expect.objectContaining({ page: 1 }))
  })

  it('review 触发 AI 预审', async () => {
    api.post.mockResolvedValue({ id: 2 })
    await approvalApi.review(2)
    expect(api.post).toHaveBeenCalledWith('/approval/requests/2/review')
  })
})

describe('auditApi', () => {
  it('logs 默认无参数', async () => {
    api.get.mockResolvedValue([])
    await auditApi.logs()
    expect(api.get).toHaveBeenCalledWith('/audit/logs', {})
  })

  it('logs 带过滤参数', async () => {
    api.get.mockResolvedValue([])
    await auditApi.logs({ userId: 'u1', limit: 10, offset: 20, since: '2026-01-01' })
    expect(api.get).toHaveBeenCalledWith('/audit/logs', { userId: 'u1', limit: 10, offset: 20, since: '2026-01-01' })
  })

  it('stats 无 since 不带参数', async () => {
    api.get.mockResolvedValue({})
    await auditApi.stats()
    expect(api.get).toHaveBeenCalledWith('/audit/stats', {})
  })

  it('stats 带 since', async () => {
    api.get.mockResolvedValue({})
    await auditApi.stats('2026-01-01')
    expect(api.get).toHaveBeenCalledWith('/audit/stats', { since: '2026-01-01' })
  })

  it('opLogs 默认分页', async () => {
    api.get.mockResolvedValue({ items: [] })
    await auditApi.opLogs()
    expect(api.get).toHaveBeenCalledWith('/audit/operations/logs', { page: 1, limit: 20 })
  })
})

describe('contractsApi', () => {
  it('list GET /contracts/admin/all', async () => {
    api.get.mockResolvedValue([])
    const res = await contractsApi.list()
    expect(api.get).toHaveBeenCalledWith('/contracts/admin/all')
    expect(res).toEqual([])
  })

  it('remove DELETE 带 id', async () => {
    api.delete.mockResolvedValue(null)
    await contractsApi.remove(1)
    expect(api.delete).toHaveBeenCalledWith('/contracts/admin/1')
  })
})

describe('crmApi', () => {
  it('customers 带过滤参数', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    await crmApi.customers({ page: 2, status: 'active', keyword: '华' })
    expect(api.get).toHaveBeenCalledWith('/crm/customers', { page: 2, status: 'active', keyword: '华' })
  })

  it('customers 无参数不带空键', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    await crmApi.customers()
    expect(api.get).toHaveBeenCalledWith('/crm/customers', {})
  })

  it('createCustomer POST', async () => {
    api.post.mockResolvedValue({})
    await crmApi.createCustomer({ name: '辰光' })
    expect(api.post).toHaveBeenCalledWith('/crm/customers', { name: '辰光' })
  })

  it('detail / updateCustomer / deleteCustomer', async () => {
    api.get.mockResolvedValue({ customer: {}, orders: [] })
    await crmApi.detail(1)
    expect(api.get).toHaveBeenCalledWith('/crm/customers/1')
    api.patch.mockResolvedValue({})
    await crmApi.updateCustomer(1, { name: 'x' })
    expect(api.patch).toHaveBeenCalledWith('/crm/customers/1', { name: 'x' })
    api.delete.mockResolvedValue(null)
    await crmApi.deleteCustomer(1)
    expect(api.delete).toHaveBeenCalledWith('/crm/customers/1')
  })

  it('analyze / createOrder / createActivity / createTask / completeTask', async () => {
    api.get.mockResolvedValue({ level: 'low', score: 0, reasons: [] })
    await crmApi.analyze(1)
    expect(api.get).toHaveBeenCalledWith('/crm/customers/1/analyze')
    api.post.mockResolvedValue({})
    await crmApi.createOrder(1, { amount: 100 })
    expect(api.post).toHaveBeenCalledWith('/crm/customers/1/orders', { amount: 100 })
    await crmApi.createActivity(1, { summary: '跟进' })
    expect(api.post).toHaveBeenCalledWith('/crm/customers/1/activities', { summary: '跟进' })
    await crmApi.createTask({ title: '回访' })
    expect(api.post).toHaveBeenCalledWith('/crm/tasks', { title: '回访' })
    await crmApi.completeTask(2)
    expect(api.post).toHaveBeenCalledWith('/crm/tasks/2/complete')
  })
})

describe('eventsApi', () => {
  it('adminAll 默认分页', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    await eventsApi.adminAll()
    expect(api.get).toHaveBeenCalledWith('/events/admin/all', { page: 1, limit: 20 })
  })

  it('adminAll 带过滤', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    await eventsApi.adminAll(1, 20, { keyword: '会', userId: 3, isCancelled: true })
    expect(api.get).toHaveBeenCalledWith('/events/admin/all', {
      page: 1,
      limit: 20,
      keyword: '会',
      userId: 3,
      isCancelled: true,
    })
  })

  it('adminRemove DELETE', async () => {
    api.delete.mockResolvedValue(null)
    await eventsApi.adminRemove(4)
    expect(api.delete).toHaveBeenCalledWith('/events/admin/4')
  })
})

describe('importApi', () => {
  it('importUsers 用默认 instance POST multipart', async () => {
    api.post.mockResolvedValue({ added: 1 })
    const file = new File(['a,b'], 'users.csv', { type: 'text/csv' })
    await importApi.importUsers(file)
    expect(api.post).toHaveBeenCalledWith('/admin/import/users', expect.any(FormData))
  })

  it('importEvents POST', async () => {
    api.post.mockResolvedValue({ added: 0 })
    await importApi.importEvents(new File([''], 'e.csv'))
    expect(api.post).toHaveBeenCalledWith('/admin/import/events', expect.any(FormData))
  })

  it('importTodos POST', async () => {
    api.post.mockResolvedValue({ added: 2 })
    await importApi.importTodos(new File([''], 't.csv'))
    expect(api.post).toHaveBeenCalledWith('/admin/import/todos', expect.any(FormData))
  })
})

describe('knowledgeApi', () => {
  it('list 默认分页', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    await knowledgeApi.list()
    expect(api.get).toHaveBeenCalledWith('/ai/knowledge', { page: 1, limit: 20 })
  })

  it('list 带 q', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    await knowledgeApi.list(1, 20, '搜索')
    expect(api.get).toHaveBeenCalledWith('/ai/knowledge', { page: 1, limit: 20, q: '搜索' })
  })

  it('create / update / remove', async () => {
    api.post.mockResolvedValue({})
    await knowledgeApi.create({ title: 't', content: 'c' })
    expect(api.post).toHaveBeenCalledWith('/ai/knowledge', { title: 't', content: 'c' })
    api.patch.mockResolvedValue({})
    await knowledgeApi.update(1, { title: 't2' })
    expect(api.patch).toHaveBeenCalledWith('/ai/knowledge/1', { title: 't2' })
    api.delete.mockResolvedValue(null)
    await knowledgeApi.remove(1)
    expect(api.delete).toHaveBeenCalledWith('/ai/knowledge/1')
  })

  it('upload 用默认 instance POST multipart', async () => {
    api.post.mockResolvedValue({})
    await knowledgeApi.upload(new File(['x'], 'a.pdf'), { title: 't' })
    expect(api.post).toHaveBeenCalledWith('/ai/knowledge/upload', expect.any(FormData))
  })
})

describe('mcpApi', () => {
  it('servers GET', async () => {
    api.get.mockResolvedValue([])
    await mcpApi.servers()
    expect(api.get).toHaveBeenCalledWith('/admin/mcp/servers')
  })

  it('register POST 带 name/url', async () => {
    api.post.mockResolvedValue([])
    await mcpApi.register('srv', 'http://localhost:9000')
    expect(api.post).toHaveBeenCalledWith('/admin/mcp/servers', { name: 'srv', url: 'http://localhost:9000' })
  })

  it('remove DELETE 带 encodeURIComponent', async () => {
    api.delete.mockResolvedValue([])
    await mcpApi.remove('a/b')
    expect(api.delete).toHaveBeenCalledWith('/admin/mcp/servers/a%2Fb')
  })

  it('discover 默认不带 force', async () => {
    api.get.mockResolvedValue([])
    await mcpApi.discover()
    expect(api.get).toHaveBeenCalledWith('/admin/mcp/tools', undefined)
  })

  it('discover force=true 传 force', async () => {
    api.get.mockResolvedValue([])
    await mcpApi.discover(true)
    expect(api.get).toHaveBeenCalledWith('/admin/mcp/tools', { force: 'true' })
  })

  it('call POST 包 arguments', async () => {
    api.post.mockResolvedValue({ executed: true, requiresConfirmation: false })
    await mcpApi.call('srv', 'tool', { a: 1 })
    expect(api.post).toHaveBeenCalledWith('/admin/mcp/call', { serverName: 'srv', toolName: 'tool', arguments: { a: 1 } })
  })
})

describe('notesApi', () => {
  it('list GET /notes/admin/all', async () => {
    api.get.mockResolvedValue([])
    await notesApi.list()
    expect(api.get).toHaveBeenCalledWith('/notes/admin/all')
  })

  it('remove DELETE', async () => {
    api.delete.mockResolvedValue(null)
    await notesApi.remove(2)
    expect(api.delete).toHaveBeenCalledWith('/notes/admin/2')
  })
})

describe('orgApi', () => {
  it('listOrganizations 默认分页', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 100 })
    await orgApi.listOrganizations()
    expect(api.get).toHaveBeenCalledWith('/org/organizations', { page: 1, limit: 100 })
  })

  it('listOrganizations 带 keyword', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 100 })
    await orgApi.listOrganizations(1, 100, 'tech')
    expect(api.get).toHaveBeenCalledWith('/org/organizations', { page: 1, limit: 100, keyword: 'tech' })
  })

  it('create/update/removeOrganization', async () => {
    api.post.mockResolvedValue({})
    await orgApi.createOrganization({ name: '研发部' })
    expect(api.post).toHaveBeenCalledWith('/org/organizations', { name: '研发部' })
    api.put.mockResolvedValue({})
    await orgApi.updateOrganization(1, { name: 'x' })
    expect(api.put).toHaveBeenCalledWith('/org/organizations/1', { name: 'x' })
    api.delete.mockResolvedValue(null)
    await orgApi.removeOrganization(1)
    expect(api.delete).toHaveBeenCalledWith('/org/organizations/1')
  })

  it('部门 CRUD', async () => {
    api.get.mockResolvedValue([])
    await orgApi.listDepartments(1)
    expect(api.get).toHaveBeenCalledWith('/org/organizations/1/departments')
    api.post.mockResolvedValue({})
    await orgApi.createDepartment(1, { name: '子部门' })
    expect(api.post).toHaveBeenCalledWith('/org/organizations/1/departments', { name: '子部门' })
    api.put.mockResolvedValue({})
    await orgApi.updateDepartment(2, { name: 'x' })
    expect(api.put).toHaveBeenCalledWith('/org/departments/2', { name: 'x' })
    api.delete.mockResolvedValue(null)
    await orgApi.removeDepartment(2)
    expect(api.delete).toHaveBeenCalledWith('/org/departments/2')
  })

  it('成员 CRUD + 邀请', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    await orgApi.listMembers(1)
    expect(api.get).toHaveBeenCalledWith('/org/organizations/1/members', { page: 1, limit: 20 })
    api.post.mockResolvedValue({})
    await orgApi.addMember(1, { userId: 3 })
    expect(api.post).toHaveBeenCalledWith('/org/organizations/1/members', { userId: 3 })
    api.put.mockResolvedValue({})
    await orgApi.updateMember(3, { role: 'admin' })
    expect(api.put).toHaveBeenCalledWith('/org/members/3', { role: 'admin' })
    api.delete.mockResolvedValue(null)
    await orgApi.removeMember(3)
    expect(api.delete).toHaveBeenCalledWith('/org/members/3')
    api.get.mockResolvedValue([])
    await orgApi.listInvites(1)
    expect(api.get).toHaveBeenCalledWith('/org/organizations/1/invites')
    api.post.mockResolvedValue({})
    await orgApi.createInvite(1, { role: 'member' })
    expect(api.post).toHaveBeenCalledWith('/org/organizations/1/invites', { role: 'member' })
    api.delete.mockResolvedValue(null)
    await orgApi.removeInvite(5)
    expect(api.delete).toHaveBeenCalledWith('/org/invites/5')
  })

  it('我的组织只读端点', async () => {
    api.get.mockResolvedValue({})
    await orgApi.getMyOrg()
    expect(api.get).toHaveBeenCalledWith('/org/my')
    api.get.mockResolvedValue([])
    await orgApi.getMyTree()
    expect(api.get).toHaveBeenCalledWith('/org/my/tree')
    await orgApi.listMyMembers()
    expect(api.get).toHaveBeenCalledWith('/org/my/members')
  })
})

describe('pmApi', () => {
  it('projects 带过滤', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    await pmApi.projects({ status: 'active', keyword: '官网' })
    expect(api.get).toHaveBeenCalledWith('/pm/projects', { status: 'active', keyword: '官网' })
  })

  it('createProject / detail / deleteProject / analyze', async () => {
    api.post.mockResolvedValue({})
    await pmApi.createProject({ name: '官网' })
    expect(api.post).toHaveBeenCalledWith('/pm/projects', { name: '官网' })
    api.get.mockResolvedValue({ project: {}, milestones: [] })
    await pmApi.detail(1)
    expect(api.get).toHaveBeenCalledWith('/pm/projects/1')
    await pmApi.analyze(1)
    expect(api.get).toHaveBeenCalledWith('/pm/projects/1/analyze')
    api.delete.mockResolvedValue(null)
    await pmApi.deleteProject(1)
    expect(api.delete).toHaveBeenCalledWith('/pm/projects/1')
  })

  it('createMilestone / createTask / completeTask', async () => {
    api.post.mockResolvedValue({})
    await pmApi.createMilestone(1, { title: '设计' })
    expect(api.post).toHaveBeenCalledWith('/pm/projects/1/milestones', { title: '设计' })
    await pmApi.createTask({ title: '开发' })
    expect(api.post).toHaveBeenCalledWith('/pm/tasks', { title: '开发' })
    await pmApi.completeTask(2)
    expect(api.post).toHaveBeenCalledWith('/pm/tasks/2/complete')
  })
})

describe('suppliersApi', () => {
  it('list GET /suppliers/admin/all', async () => {
    api.get.mockResolvedValue([])
    await suppliersApi.list()
    expect(api.get).toHaveBeenCalledWith('/suppliers/admin/all')
  })

  it('remove DELETE', async () => {
    api.delete.mockResolvedValue(null)
    await suppliersApi.remove(1)
    expect(api.delete).toHaveBeenCalledWith('/suppliers/admin/1')
  })
})

describe('tagsApi', () => {
  it('list GET /tags/admin/all', async () => {
    api.get.mockResolvedValue([])
    await tagsApi.list()
    expect(api.get).toHaveBeenCalledWith('/tags/admin/all')
  })

  it('remove DELETE', async () => {
    api.delete.mockResolvedValue(null)
    await tagsApi.remove(1)
    expect(api.delete).toHaveBeenCalledWith('/tags/admin/1')
  })
})

describe('templatesApi', () => {
  it('list GET /admin/templates', async () => {
    api.get.mockResolvedValue([])
    await templatesApi.list()
    expect(api.get).toHaveBeenCalledWith('/admin/templates')
  })

  it('importTemplate 无 userId 不带 query', async () => {
    api.post.mockResolvedValue({})
    await templatesApi.importTemplate('tpl-1')
    expect(api.post).toHaveBeenCalledWith('/admin/templates/tpl-1/import')
  })

  it('importTemplate 带 userId query', async () => {
    api.post.mockResolvedValue({})
    await templatesApi.importTemplate('tpl-1', 5)
    expect(api.post).toHaveBeenCalledWith('/admin/templates/tpl-1/import?userId=5')
  })
})

describe('usersApi', () => {
  it('list 默认分页', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    await usersApi.list()
    expect(api.get).toHaveBeenCalledWith('/users', { page: 1, limit: 20 })
  })

  it('list 带 keyword', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    await usersApi.list(1, 20, 'alex')
    expect(api.get).toHaveBeenCalledWith('/users', { page: 1, limit: 20, keyword: 'alex' })
  })

  it('create POST', async () => {
    api.post.mockResolvedValue({})
    await usersApi.create({ username: 'u', email: 'e', password: 'p', nickname: 'n' })
    expect(api.post).toHaveBeenCalledWith('/users', { username: 'u', email: 'e', password: 'p', nickname: 'n' })
  })

  it('updateRole PATCH /role', async () => {
    api.patch.mockResolvedValue({})
    await usersApi.updateRole(1, 'admin')
    expect(api.patch).toHaveBeenCalledWith('/users/1/role', { role: 'admin' })
  })

  it('remove DELETE / remove detail GET', async () => {
    api.delete.mockResolvedValue(null)
    await usersApi.remove(1)
    expect(api.delete).toHaveBeenCalledWith('/users/1')
    api.get.mockResolvedValue({})
    await usersApi.detail(1)
    expect(api.get).toHaveBeenCalledWith('/admin/users/1/detail')
  })
})

describe('workbenchApi', () => {
  it('events 过滤空键', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    await workbenchApi.events({})
    expect(api.get).toHaveBeenCalledWith('/events/search', {})
  })

  it('events 带全部查询键', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    await workbenchApi.events({ keyword: 'k', start: 's', end: 'e', page: 2, limit: 10 })
    expect(api.get).toHaveBeenCalledWith('/events/search', { keyword: 'k', start: 's', end: 'e', page: 2, limit: 10 })
  })

  it('removeEvent DELETE', async () => {
    api.delete.mockResolvedValue(null)
    await workbenchApi.removeEvent(1)
    expect(api.delete).toHaveBeenCalledWith('/events/1')
  })

  it('todos GET', async () => {
    api.get.mockResolvedValue([])
    await workbenchApi.todos()
    expect(api.get).toHaveBeenCalledWith('/todos')
  })

  it('createTodo POST', async () => {
    api.post.mockResolvedValue({})
    await workbenchApi.createTodo({ title: 't' })
    expect(api.post).toHaveBeenCalledWith('/todos', { title: 't' })
  })

  it('toggleTodo PATCH complete', async () => {
    api.patch.mockResolvedValue({})
    await workbenchApi.toggleTodo(1)
    expect(api.patch).toHaveBeenCalledWith('/todos/1/complete')
  })

  it('removeTodo DELETE', async () => {
    api.delete.mockResolvedValue(null)
    await workbenchApi.removeTodo(1)
    expect(api.delete).toHaveBeenCalledWith('/todos/1')
  })

  it('notifications 默认分页', async () => {
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    await workbenchApi.notifications()
    expect(api.get).toHaveBeenCalledWith('/notifications', { page: 1, limit: 20 })
  })

  it('unreadCount / readNotification / readAllNotifications / removeNotification', async () => {
    api.get.mockResolvedValue({ count: 2 })
    await workbenchApi.unreadCount()
    expect(api.get).toHaveBeenCalledWith('/notifications/unread-count')
    api.patch.mockResolvedValue(null)
    await workbenchApi.readNotification(1)
    expect(api.patch).toHaveBeenCalledWith('/notifications/1/read')
    await workbenchApi.readAllNotifications()
    expect(api.patch).toHaveBeenCalledWith('/notifications/read-all')
    api.delete.mockResolvedValue(null)
    await workbenchApi.removeNotification(1)
    expect(api.delete).toHaveBeenCalledWith('/notifications/1')
  })
})
