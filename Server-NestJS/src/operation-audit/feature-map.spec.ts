// SPDX-License-Identifier: Apache-2.0

import { deriveFeature } from './feature-map';

describe('deriveFeature（操作审计功能名映射）', () => {
  it('精确匹配：POST /auth/login → auth.login', () => {
    expect(deriveFeature('POST', '/api/v1/auth/login')).toEqual({ key: 'auth.login', fallback: 'Auth · Login' });
  });

  it('精确匹配且带子路径：POST /todos/123 → todos.create', () => {
    expect(deriveFeature('POST', '/api/v1/todos/123')).toEqual({ key: 'todos.create', fallback: 'Todos · Create' });
  });

  it('剥离去掉 /api/v1 前缀与 query 后再精确匹配', () => {
    expect(deriveFeature('GET', '/api/v1/points/me?from=app')).toEqual({ key: 'points.myOverview', fallback: 'Points · My overview' });
  });

  it('未知模块按 method 推导（POST → create）', () => {
    expect(deriveFeature('POST', '/api/v1/foo-bar/1')).toEqual({ key: 'foo-bar.create', fallback: 'foo-bar · create' });
  });

  it('无 action 映射的 method（GET）→ unknown.<method>', () => {
    expect(deriveFeature('GET', '/api/v1/somewhere')).toEqual({ key: 'unknown.get', fallback: 'somewhere · GET' });
  });

  it('空路径 → unknown.unknown', () => {
    expect(deriveFeature('POST', '')).toEqual({ key: 'unknown.unknown', fallback: 'Unknown' });
    expect(deriveFeature('POST', '/api/v1/')).toEqual({ key: 'unknown.unknown', fallback: 'Unknown' });
  });

  it('DELETE → delete、PUT → update、method 大小写不敏感', () => {
    expect(deriveFeature('delete', '/api/v1/users/9')).toEqual({ key: 'users.delete', fallback: 'users · delete' });
    // PUT 无精确匹配（EXACT 仅 PATCH/DELETE /todos）→ 走 method 推导
    expect(deriveFeature('PUT', '/api/v1/todos/1')).toEqual({ key: 'todos.update', fallback: 'todos · update' });
  });

  it('PATCH 精确匹配子路径：/ai/knowledge/123 → ai.updateKnowledge', () => {
    expect(deriveFeature('PATCH', '/api/v1/ai/knowledge/123')).toEqual({ key: 'ai.updateKnowledge', fallback: 'AI · Update knowledge' });
  });

  it('approval decide/review（带 :id）→ approval.decide/review（非 approval.create）', () => {
    expect(deriveFeature('POST', '/api/v1/approval/requests/3/decide')).toEqual({ key: 'approval.decide', fallback: 'Approval · Decide' });
    expect(deriveFeature('POST', '/api/v1/approval/requests/3/review')).toEqual({ key: 'approval.review', fallback: 'Approval · Review' });
  });
});
