import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';
import { CrmService } from '../src/crm/crm.service';
import { QueryCustomersTool } from '../src/ai/tools/query-customers.tool';
import { CreateFollowupTaskTool } from '../src/ai/tools/create-followup-task.tool';

/**
 * 越权测试矩阵（Authorization Matrix，V1.0 Blocker 回归套件，评审三 §5）
 *
 * 目标：系统化验证「A 不能访问/修改/删除 B 的数据」。
 * 断言口径：跨用户访问返回 403（显式拒绝）或 404（不暴露存在性）即视为「拒绝」；
 *           绝不返回 2xx，也绝不允许 5xx（500 视为实现缺陷，测试失败）。
 *           注：NestJS ValidationPipe 在控制器前执行，故修改操作须发送合法 body，
 *               保证所有权检查（403/404）先于任何校验错误触发。
 *
 * 覆盖实体：events / todos / crm-customers / pm-projects / approval-requests /
 *           suppliers / contracts（生成模块）。
 * 覆盖操作：GET :id / PUT·PATCH :id / DELETE :id + 列表隔离（B 的列表不含 A 的数据）。
 *
 * 后续增量（评审矩阵剩余行）：AI 工具越权（A 让 AI 读/写 B 数据 → 拒绝）、
 *           Headless API 越权、SubAgent 继承 scope、批处理、撤销越权。
 */

interface MatrixOp {
  op: string;
  method: 'get' | 'patch' | 'put' | 'delete';
  path: (id: number) => string;
  body?: Record<string, unknown>;
}

interface MatrixRow {
  label: string;
  createPath: string;
  createBody: () => Record<string, unknown>;
  listPath: string;
  ops: MatrixOp[];
}

const REJECTED = [403, 404];

const MATRIX: MatrixRow[] = [
  {
    label: 'events',
    createPath: '/api/v1/events',
    createBody: () => ({
      title: '越权矩阵事件',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
    }),
    listPath: '/api/v1/events',
    ops: [
      { op: 'GET :id', method: 'get', path: (id) => `/api/v1/events/${id}` },
      { op: 'PUT :id', method: 'put', path: (id) => `/api/v1/events/${id}`, body: { title: '被篡改' } },
      { op: 'DELETE :id', method: 'delete', path: (id) => `/api/v1/events/${id}` },
    ],
  },
  {
    label: 'todos',
    createPath: '/api/v1/todos',
    createBody: () => ({ title: '越权矩阵待办' }),
    listPath: '/api/v1/todos',
    ops: [
      { op: 'PATCH :id', method: 'patch', path: (id) => `/api/v1/todos/${id}`, body: { title: '被篡改' } },
      { op: 'DELETE :id', method: 'delete', path: (id) => `/api/v1/todos/${id}` },
    ],
  },
  {
    label: 'crm customers',
    createPath: '/api/v1/crm/customers',
    createBody: () => ({ name: '越权矩阵客户' }),
    listPath: '/api/v1/crm/customers',
    ops: [
      { op: 'GET :id', method: 'get', path: (id) => `/api/v1/crm/customers/${id}` },
      { op: 'PATCH :id', method: 'patch', path: (id) => `/api/v1/crm/customers/${id}`, body: { name: '被篡改' } },
      { op: 'DELETE :id', method: 'delete', path: (id) => `/api/v1/crm/customers/${id}` },
    ],
  },
  {
    label: 'pm projects',
    createPath: '/api/v1/pm/projects',
    createBody: () => ({ name: '越权矩阵项目' }),
    listPath: '/api/v1/pm/projects',
    ops: [
      { op: 'GET :id', method: 'get', path: (id) => `/api/v1/pm/projects/${id}` },
      { op: 'PATCH :id', method: 'patch', path: (id) => `/api/v1/pm/projects/${id}`, body: { name: '被篡改' } },
      { op: 'DELETE :id', method: 'delete', path: (id) => `/api/v1/pm/projects/${id}` },
    ],
  },
  {
    label: 'approval requests',
    createPath: '/api/v1/approval/requests',
    createBody: () => ({ title: '越权矩阵审批', type: 'reimbursement', amount: 800, reason: '越权测试' }),
    listPath: '/api/v1/approval/requests',
    ops: [
      { op: 'GET :id', method: 'get', path: (id) => `/api/v1/approval/requests/${id}` },
      { op: 'DELETE :id', method: 'delete', path: (id) => `/api/v1/approval/requests/${id}` },
    ],
  },
  {
    label: 'suppliers（生成模块）',
    createPath: '/api/v1/suppliers',
    createBody: () => ({ name: '越权矩阵供应商', contact: '测试', status: 'active', riskLevel: 'low' }),
    listPath: '/api/v1/suppliers',
    ops: [
      { op: 'PATCH :id', method: 'patch', path: (id) => `/api/v1/suppliers/${id}`, body: { name: '被篡改' } },
      { op: 'DELETE :id', method: 'delete', path: (id) => `/api/v1/suppliers/${id}` },
    ],
  },
  {
    label: 'contracts（生成模块）',
    createPath: '/api/v1/contracts',
    createBody: () => ({ name: '越权矩阵合同', counterparty: '测试', status: 'draft' }),
    listPath: '/api/v1/contracts',
    ops: [
      { op: 'PATCH :id', method: 'patch', path: (id) => `/api/v1/contracts/${id}`, body: { name: '被篡改' } },
      { op: 'DELETE :id', method: 'delete', path: (id) => `/api/v1/contracts/${id}` },
    ],
  },
];

function extractItems(data: any): unknown[] {
  return Array.isArray(data) ? data : (data?.items ?? []);
}

describe('越权测试矩阵（Authorization Matrix，V1.0 Blocker 回归）', () => {
  let app: INestApplication;
  let userA: { accessToken: string };
  let userB: { accessToken: string };
  // AI 工具数据隔离（嵌套 describe 共享同一 app）
  let userAId: number;
  let crmService: CrmService;

  beforeAll(async () => {
    app = await createTestApp();
    userA = await registerUser(app, {
      username: 'authz_a',
      email: 'authz_a@test.com',
      password: 'AuthzA1234',
      nickname: 'AuthzA',
    });
    userB = await registerUser(app, {
      username: 'authz_b',
      email: 'authz_b@test.com',
      password: 'AuthzB1234',
      nickname: 'AuthzB',
    });
    const meA = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(userA.accessToken))
      .expect(200);
    userAId = meA.body.data.id;
    crmService = app.get(CrmService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe.each(MATRIX)('$label', (row) => {
    let myId: number;

    it('A 创建资源（基线）', async () => {
      const res = await request(app.getHttpServer())
        .post(row.createPath)
        .set(authHeader(userA.accessToken))
        .send(row.createBody())
        .expect(201);
      myId = res.body.data.id;
      expect(myId).toBeDefined();
    });

    it('列表隔离：B 的列表不含 A 的数据', async () => {
      const listB = await request(app.getHttpServer())
        .get(row.listPath)
        .set(authHeader(userB.accessToken))
        .expect(200);
      const ids = extractItems(listB.body.data).map((x: any) => x.id);
      expect(ids).not.toContain(myId);
    });

    it.each(row.ops)('B $op → 拒绝（403/404，非 2xx 非 5xx）', async (op: MatrixOp) => {
      const req = request(app.getHttpServer())[op.method](op.path(myId)).set(authHeader(userB.accessToken));
      if (op.body) req.send(op.body);
      const res = await req;
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(REJECTED).toContain(res.status);
    });
  });

  it('admin 端点保护：普通 user 访问 /users → 403', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set(authHeader(userA.accessToken))
      .expect(403);
  });

  it('admin 端点保护：普通 user 访问 /audit/logs → 403', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/audit/logs')
      .set(authHeader(userA.accessToken))
      .expect(403);
  });

  /**
   * AI 工具数据隔离（评审三 §5 矩阵剩余行：AI Tool Read / AI Tool Write）。
   * 确定性验证：AI 工具以调用者 userId 执行，A 的身份无法读/写 B 的数据。
   * 直接实例化 crm 工具（mirror AI Agent 的工具执行路径），传 A 的 userId + B 的数据 id。
   * 复用主 describe 的 app / 用户，避免同文件二次 createTestApp 的 SQLite 文件锁冲突。
   */
  describe('AI 工具数据隔离', () => {
    let bCustomerId: number;

    beforeAll(async () => {
      // B 创建一条客户数据作为越权目标
      const created = await request(app.getHttpServer())
        .post('/api/v1/crm/customers')
        .set(authHeader(userB.accessToken))
        .send({ name: '越权目标客户' })
        .expect(201);
      bCustomerId = created.body.data.id;
    });

    it('AI Tool Read 越权：A 查客户 → 不含 B 的客户', async () => {
      const queryTool = new QueryCustomersTool(crmService);
      const res = await queryTool.execute({}, String(userAId));
      expect(res.success).toBe(true);
      const ids = (res.data as any).items.map((c: any) => c.id);
      expect(ids).not.toContain(bCustomerId);
    });

    it('AI Tool Write 越权：A 对 B 的客户建跟进任务 → 拒绝', async () => {
      const createTool = new CreateFollowupTaskTool(crmService);
      const res = await createTool.execute(
        { customerId: bCustomerId, title: '越权任务' },
        String(userAId),
      );
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/无权|不存在/);
    });
  });
});
