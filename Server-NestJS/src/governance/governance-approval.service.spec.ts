// SPDX-License-Identifier: Apache-2.0

import { Repository } from 'typeorm';
import { GovernanceApprovalService } from './governance-approval.service';
import { AiConfirmationRequest } from '../ai/approvals/ai-confirmation-request.entity';

describe('GovernanceApprovalService（D2-2 治理台审批 CRUD 读侧）', () => {
  let service: GovernanceApprovalService;
  let repo: { find: jest.Mock };

  const fakeRow = (over: Partial<AiConfirmationRequest>): AiConfirmationRequest =>
    ({ id: 1, token: 'tok', status: 'pending', riskLevel: 'R4', createdAt: new Date(), ...over }) as AiConfirmationRequest;

  beforeEach(() => {
    repo = { find: jest.fn() };
    service = new GovernanceApprovalService(repo as unknown as Repository<AiConfirmationRequest>);
  });

  describe('listPendingApprovals', () => {
    it('缺省 limit=50，查询 pending+R4，createdAt DESC', async () => {
      const rows = [fakeRow({ token: 'p1' }), fakeRow({ token: 'p2' })];
      repo.find.mockResolvedValue(rows);

      await expect(service.listPendingApprovals()).resolves.toBe(rows);
      expect(repo.find).toHaveBeenCalledWith({
        where: { status: 'pending', riskLevel: 'R4' },
        order: { createdAt: 'DESC' },
        take: 50,
      });
    });

    it('传入自定义 limit 原样透传 take', async () => {
      repo.find.mockResolvedValue([]);
      await service.listPendingApprovals(7);
      const arg = (repo.find as jest.Mock).mock.calls[0][0] as { take: number };
      expect(arg.take).toBe(7);
    });
  });

  describe('listDecidedApprovals', () => {
    it('查询 approved/declined（In 操作符）+ R4，decidedAt DESC', async () => {
      const rows = [fakeRow({ token: 'd1', status: 'approved' })];
      repo.find.mockResolvedValue(rows);

      await expect(service.listDecidedApprovals(25)).resolves.toBe(rows);
      const arg = (repo.find as jest.Mock).mock.calls[0][0] as {
        where: { status: unknown; riskLevel: string };
        order: Record<string, string>;
        take: number;
      };
      expect((arg.where.status as unknown as { _value: string[] })._value).toEqual([
        'approved',
        'declined',
      ]);
      expect(arg.where.riskLevel).toBe('R4');
      expect(arg.order).toEqual({ decidedAt: 'DESC' });
      expect(arg.take).toBe(25);
    });

    it('缺省 limit=50', async () => {
      repo.find.mockResolvedValue([]);
      await service.listDecidedApprovals();
      const arg = (repo.find as jest.Mock).mock.calls[0][0] as { take: number };
      expect(arg.take).toBe(50);
    });
  });
});
