// SPDX-License-Identifier: Apache-2.0

import { QueryApprovalRequestsTool } from './query-approval-requests.tool';
import { QueryApprovalPoliciesTool } from './query-approval-policies.tool';
import { SubmitApprovalRequestTool } from './submit-approval-request.tool';
import { ReviewApprovalRequestTool } from './review-approval-request.tool';

describe('Approval tools', () => {
  describe('QueryApprovalRequestsTool', () => {
    const svc = { listRequests: jest.fn() } as any;
    const tool = new QueryApprovalRequestsTool(svc);
    it('按状态查询', async () => {
      svc.listRequests.mockResolvedValue({ total: 1, items: [{ id: 1, title: '报销', type: 'reimbursement', amount: 800, status: 'auto_approved', riskLevel: 'low', aiRecommendation: 'ok' }] });
      const result = await tool.execute({ status: 'auto_approved' }, '1');
      expect(svc.listRequests).toHaveBeenCalledWith(1, { status: 'auto_approved' });
      expect(result.success).toBe(true);
    });
    it('toToolDefinition 生成合法工具定义', () => {
      const def = tool.toToolDefinition();
      expect(def.type).toBe('function');
      expect(def.function.name).toBe('query_approval_requests');
    });
    it('服务异常 → success:false', async () => {
      svc.listRequests.mockRejectedValue(new Error('db down'));
      const result = await tool.execute({}, '1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('db down');
    });
    it('无 aiRecommendation 时置 null', async () => {
      svc.listRequests.mockResolvedValue({ total: 1, items: [{ id: 2, title: '出差', type: 'travel', amount: 300, status: 'pending', riskLevel: 'low' }] });
      const result = await tool.execute({}, '1');
      expect((result.data as any).items[0].aiRecommendation).toBeNull();
    });
  });

  describe('QueryApprovalPoliciesTool', () => {
    const svc = { listPolicies: jest.fn() } as any;
    const tool = new QueryApprovalPoliciesTool(svc);
    it('返回政策阈值', async () => {
      svc.listPolicies.mockResolvedValue([{ id: 1, title: '报销政策', type: 'reimbursement', maxAmount: 1000, active: true }]);
      const result = await tool.execute({}, '1');
      expect((result.data as any)[0].maxAmount).toBe(1000);
    });
    it('toToolDefinition 生成合法工具定义', () => {
      const def = tool.toToolDefinition();
      expect(def.type).toBe('function');
      expect(def.function.name).toBe('query_approval_policies');
    });
    it('服务异常 → success:false', async () => {
      svc.listPolicies.mockRejectedValue(new Error('no policies'));
      const result = await tool.execute({}, '1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('no policies');
    });
  });

  describe('SubmitApprovalRequestTool', () => {
    const svc = { createRequest: jest.fn() } as any;
    const tool = new SubmitApprovalRequestTool(svc);
    it('声明为需确认写工具', () => {
      expect(tool.requiresConfirmation).toBe(true);
    });
    it('构造 dto 创建请求', async () => {
      svc.createRequest.mockResolvedValue({ id: 3, title: '报销', status: 'pending' });
      const result = await tool.execute({ title: '报销', amount: 800, reason: '差旅' }, '3');
      expect(svc.createRequest).toHaveBeenCalledWith({ title: '报销', amount: 800, reason: '差旅' }, 3);
      expect((result.data as any).id).toBe(3);
    });
    it('金额非法 → 参数错误', async () => {
      const result = await tool.execute({ title: 'x', amount: 'abc', reason: 'r' }, '3');
      expect(result.success).toBe(false);
    });
  });

  describe('ReviewApprovalRequestTool', () => {
    const svc = { reviewRequest: jest.fn() } as any;
    const tool = new ReviewApprovalRequestTool(svc);
    it('声明为需确认写工具', () => {
      expect(tool.requiresConfirmation).toBe(true);
      expect(tool.permissions).toEqual({ requireVerifiedEmail: true });
    });
    it('调用预审返回分级结果', async () => {
      svc.reviewRequest.mockResolvedValue({ id: 1, status: 'auto_approved', riskLevel: 'low', aiRecommendation: '自动通过' });
      const result = await tool.execute({ requestId: 1 }, '3');
      expect(svc.reviewRequest).toHaveBeenCalledWith(1, 3);
      expect((result.data as any).status).toBe('auto_approved');
    });
    it('toToolDefinition 生成合法工具定义', () => {
      const def = tool.toToolDefinition();
      expect(def.type).toBe('function');
      expect(def.function.name).toBe('review_approval_request');
      expect(def.function.parameters.required).toContain('requestId');
    });
    it('requestId 非法 → 参数错误', async () => {
      const result = await tool.execute({ requestId: 'abc' }, '3');
      expect(result.success).toBe(false);
      expect(result.error).toContain('必须是数字');
    });
    it('服务异常 → success:false', async () => {
      svc.reviewRequest.mockRejectedValue(new Error('approval down'));
      const result = await tool.execute({ requestId: 1 }, '3');
      expect(result.success).toBe(false);
      expect(result.error).toBe('approval down');
    });
    it('无 aiRecommendation 时置 null', async () => {
      svc.reviewRequest.mockResolvedValue({ id: 2, status: 'needs_review', riskLevel: 'medium' });
      const result = await tool.execute({ requestId: 2 }, '3');
      expect((result.data as any).aiRecommendation).toBeNull();
    });
  });
});
