// SPDX-License-Identifier: Apache-2.0

import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';

describe('ApprovalController（AI Approval 旗舰）', () => {
  let controller: ApprovalController;
  let approvalService: Record<string, jest.Mock>;

  const mockUser = { sub: 1, username: 'alex' };
  const ability = {} as any;

  const methods = [
    'createRequest', 'listRequests', 'getRequest', 'removeRequest',
    'reviewRequest', 'decideRequest', 'listPolicies', 'createPolicy',
    'updatePolicy', 'removePolicy',
  ];

  beforeEach(() => {
    approvalService = Object.fromEntries(methods.map((m) => [m, jest.fn()]));
    controller = new ApprovalController(approvalService as unknown as ApprovalService);
  });

  it('审批请求 CRUD + AI 预审 + 人工复核委托 service', async () => {
    const dto = { title: '报销', amount: 500, reason: '差旅' };
    approvalService.createRequest.mockReturnValue({ id: 1 });
    approvalService.listRequests.mockReturnValue({ items: [], total: 0 });
    approvalService.getRequest.mockReturnValue({ id: 1 });
    approvalService.removeRequest.mockResolvedValue(undefined);
    approvalService.reviewRequest.mockReturnValue({ id: 1, status: 'approved', aiSuggestion: '通过' });
    approvalService.decideRequest.mockReturnValue({ id: 1, status: 'approved' });

    expect(controller.createRequest(dto as any, mockUser as any)).toEqual({ id: 1 });
    expect(controller.listRequests(mockUser as any, 1, 20, 'pending')).toEqual({ items: [], total: 0 });
    expect(controller.getRequest(1, mockUser as any, ability)).toEqual({ id: 1 });
    await expect(controller.removeRequest(1, mockUser as any, ability)).resolves.toBeNull();
    expect(controller.review(1, mockUser as any)).toEqual({ id: 1, status: 'approved', aiSuggestion: '通过' });
    expect(controller.decide(1, { decision: 'approve' } as any, mockUser as any)).toEqual({ id: 1, status: 'approved' });

    expect(approvalService.createRequest).toHaveBeenCalledWith(dto, 1);
    expect(approvalService.listRequests).toHaveBeenCalledWith(1, { status: 'pending', page: 1, limit: 20 });
    expect(approvalService.getRequest).toHaveBeenCalledWith(1, ability);
    expect(approvalService.removeRequest).toHaveBeenCalledWith(1, ability);
    expect(approvalService.reviewRequest).toHaveBeenCalledWith(1, 1);
    expect(approvalService.decideRequest).toHaveBeenCalledWith(1, 'approve', 1);
  });

  it('审批政策 CRUD 委托 service', async () => {
    const dto = { name: '报销政策', threshold: 1000, autoApprove: true };
    approvalService.listPolicies.mockReturnValue([]);
    approvalService.createPolicy.mockReturnValue({ id: 1 });
    approvalService.updatePolicy.mockReturnValue({ id: 1 });
    approvalService.removePolicy.mockResolvedValue(undefined);

    expect(controller.listPolicies(mockUser as any)).toEqual([]);
    expect(controller.createPolicy(dto as any, mockUser as any)).toEqual({ id: 1 });
    expect(controller.updatePolicy(1, { threshold: 2000 } as any, mockUser as any)).toEqual({ id: 1 });
    await expect(controller.removePolicy(1, mockUser as any)).resolves.toBeNull();

    expect(approvalService.listPolicies).toHaveBeenCalledWith(1);
    expect(approvalService.createPolicy).toHaveBeenCalledWith(dto, 1);
    expect(approvalService.updatePolicy).toHaveBeenCalledWith(1, { threshold: 2000 }, 1);
    expect(approvalService.removePolicy).toHaveBeenCalledWith(1, 1);
  });
});
