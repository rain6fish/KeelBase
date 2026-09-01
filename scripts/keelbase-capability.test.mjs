// SPDX-License-Identifier: Apache-2.0

/**
 * EB-3 轻量 Capability 声明解析测试（node:test，零依赖）。
 * 运行：node --test scripts/keelbase-capability.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCapability } from './keelbase-capability.mjs';

test('parseCapability：read → R1 自动 / write → R3 需人工确认', () => {
  const r = parseCapability({
    system: { name: '外部 CRM', baseUrl: 'http://crm:8080/api', audience: 'crm' },
    capabilities: [
      { id: 'list_customers', label: '客户列表', action: 'read', http: { method: 'GET', path: '/customers' } },
      { id: 'create_followup', label: '创建跟进', action: 'write', http: { method: 'POST', path: '/customers/{id}/followups' } },
    ],
  });
  assert.equal(r.baseUrl, 'http://crm:8080/api');
  assert.equal(r.audience, 'crm');
  assert.equal(r.tools[0].riskLevel, 'R1');
  assert.equal(r.tools[1].riskLevel, 'R3');
});

test('risk 字段显式覆盖（write 可标更高风险）', () => {
  const r = parseCapability({
    capabilities: [{ id: 'update_order', action: 'write', risk: 'R4', http: { method: 'PATCH', path: '/orders/{id}' } }],
  });
  assert.equal(r.tools[0].riskLevel, 'R4');
});

test('参数映射：pathParams 必填 + query/body 可空（兼容 YAML 字符串数组）', () => {
  const r = parseCapability({
    capabilities: [{
      id: 'create_followup',
      action: 'write',
      http: { method: 'POST', path: '/customers/{id}/followups', pathParams: '[id]', query: 'verbose', body: 'content, dueDate' },
    }],
  });
  const t = r.tools[0];
  assert.deepEqual(t.parameters, [
    { name: 'id', type: 'string', required: true },
    { name: 'verbose', type: 'string', required: false },
    { name: 'content', type: 'string', required: false },
    { name: 'dueDate', type: 'string', required: false },
  ]);
});

test('缺 id/http → 报错（防生成无参数工具）', () => {
  assert.throws(() => parseCapability({ capabilities: [{ action: 'read' }] }));
  assert.throws(() => parseCapability({ capabilities: [{ id: 'x', http: { method: 'GET' } }] }));
});

test('空声明 → 空工具（不崩溃）', () => {
  assert.deepEqual(parseCapability({}).tools, []);
});
