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
  });

  describe('QueryApprovalPoliciesTool', () => {
    const svc = { listPolicies: jest.fn() } as any;
    const tool = new QueryApprovalPoliciesTool(svc);
    it('返回政策阈值', async () => {
      svc.listPolicies.mockResolvedValue([{ id: 1, title: '报销政策', type: 'reimbursement', maxAmount: 1000, active: true }]);
      const result = await tool.execute({}, '1');
      expect((result.data as any)[0].maxAmount).toBe(1000);
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
  });
});
