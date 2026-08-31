import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { ApprovalRequest } from './approval-request.entity';
import { ApprovalPolicy } from './approval-policy.entity';
import { User } from '../common/entities/user.entity';
import { CreateRequestDto, CreatePolicyDto } from './dto/approval.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

/**
 * AI Approval 旗舰应用：审批请求 + 审批政策 服务。
 * AI 预审（reviewRequest）按政策金额阈值分级：低风险自动通过 / 高风险转人工复核。
 * 所有权 = requesterId（请求） / userId（政策）。
 */
@Injectable()
export class ApprovalService {
  constructor(
    @InjectRepository(ApprovalRequest)
    private readonly requests: Repository<ApprovalRequest>,
    @InjectRepository(ApprovalPolicy)
    private readonly policies: Repository<ApprovalPolicy>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  // ── Request ───────────────────────────────────────────────

  async createRequest(dto: CreateRequestDto, userId: number): Promise<ApprovalRequest> {
    return this.requests.save(
      this.requests.create({ ...dto, requesterId: userId, status: 'pending' }),
    );
  }

  async listRequests(
    userId: number,
    filter: { status?: string; page?: number; limit?: number } = {},
  ): Promise<{ items: ApprovalRequest[]; total: number }> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const where: Record<string, unknown> = { requesterId: userId };
    if (filter.status) where.status = filter.status;
    const [items, total] = await this.requests.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  async getRequest(id: number, ability: AppAbility): Promise<ApprovalRequest> {
    const entity = await this.requests.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('审批请求不存在');
    if (ability.cannot('read', subject('ApprovalRequest', entity))) {
      throw new ForbiddenException('无权访问此审批请求');
    }
    // A-7 审批链可视化：联用户表带发起人/审批人用户名（「谁」要具体）
    const [requester, reviewer] = await Promise.all([
      entity.requesterId ? this.users.findOne({ where: { id: entity.requesterId } }) : null,
      entity.reviewerId ? this.users.findOne({ where: { id: entity.reviewerId } }) : null,
    ]);
    return {
      ...entity,
      requesterName: requester?.username ?? null,
      reviewerName: reviewer?.username ?? null,
    } as ApprovalRequest;
  }

  async removeRequest(id: number, ability: AppAbility): Promise<void> {
    const entity = await this.getRequest(id, ability);
    await this.requests.softDelete(entity.id);
  }

  /**
   * AI 预审（review_approval_request 工具核心）：
   * 匹配 type 的启用政策，amount <= maxAmount → 低风险自动通过；否则转人工复核。
   */
  async reviewRequest(id: number, userId: number): Promise<ApprovalRequest> {
    const req = await this.requests.findOne({ where: { id, requesterId: userId } });
    if (!req) throw new NotFoundException('审批请求不存在或无权访问');
    if (req.status !== 'pending') throw new BadRequestException('仅待处理的请求可预审');

    // 政策归本人所有（createPolicy/listPolicies 均按 userId）：预审只命中本人政策，防跨用户政策泄漏/误判
    const policy = await this.policies.findOne({ where: { type: req.type, active: true, userId } });
    const threshold = policy?.maxAmount ?? 1000;

    let status: string;
    let riskLevel: string;
    let recommendation: string;
    if (req.amount <= threshold) {
      status = 'auto_approved';
      riskLevel = 'low';
      recommendation = `符合政策「${policy?.title ?? '默认审批政策'}」：金额 ¥${req.amount} ≤ 阈值 ¥${threshold}，自动通过。`;
    } else {
      status = 'needs_review';
      riskLevel = req.amount > threshold * 3 ? 'high' : 'medium';
      recommendation = `超出政策「${policy?.title ?? '默认审批政策'}」阈值（金额 ¥${req.amount} > ¥${threshold}），转人工复核。`;
    }

    req.status = status;
    req.riskLevel = riskLevel;
    req.aiRecommendation = recommendation;
    req.reviewerId = status === 'auto_approved' ? userId : null;
    req.decidedAt = status === 'auto_approved' ? new Date() : null;
    return this.requests.save(req);
  }

  /** 人工复核决定（仅 needs_review 请求） */
  async decideRequest(id: number, decision: 'approved' | 'rejected', userId: number): Promise<ApprovalRequest> {
    const req = await this.requests.findOne({ where: { id, requesterId: userId } });
    if (!req) throw new NotFoundException('审批请求不存在或无权访问');
    if (req.status !== 'needs_review') throw new BadRequestException('仅待复核的请求可决定');
    req.status = decision;
    req.reviewerId = userId;
    req.decidedAt = new Date();
    return this.requests.save(req);
  }

  // ── Policy ────────────────────────────────────────────────

  async listPolicies(userId: number): Promise<ApprovalPolicy[]> {
    return this.policies.find({ where: { userId }, order: { type: 'ASC' } });
  }

  async createPolicy(dto: CreatePolicyDto, userId: number): Promise<ApprovalPolicy> {
    return this.policies.save(this.policies.create({ ...dto, userId }));
  }

  async updatePolicy(id: number, dto: Partial<CreatePolicyDto>, userId: number): Promise<ApprovalPolicy> {
    const policy = await this.policies.findOne({ where: { id, userId } });
    if (!policy) throw new NotFoundException('审批政策不存在');
    Object.assign(policy, dto);
    return this.policies.save(policy);
  }

  async removePolicy(id: number, userId: number): Promise<void> {
    const policy = await this.policies.findOne({ where: { id, userId } });
    if (!policy) throw new NotFoundException('审批政策不存在');
    await this.policies.delete(policy.id);
  }
}
