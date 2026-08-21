import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { OperationAuditLog } from './operation-audit-log.entity';
import {
  AuditChainService,
  ChainVerification,
} from '../common/audit-chain/audit-chain.service';

export interface OperationAuditEntry {
  userId?: number | null;
  action: string;
  method: string;
  path: string;
  featureKey?: string | null;
  featureFallback?: string | null;
  targetId?: string | null;
  requestBody?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  statusCode?: number | null;
}

@Injectable()
export class OperationAuditService {
  private readonly logger = new Logger(OperationAuditService.name);

  constructor(
    @InjectRepository(OperationAuditLog)
    private readonly logRepo: Repository<OperationAuditLog>,
    private readonly auditChain: AuditChainService,
  ) {}

  /**
   * 记录一条操作审计。落库失败静默（审计失败不应影响业务）。
   * HS-11：写入同时计算哈希链（prev_hash + hash）。
   */
  /** 审计写串行队列：杜绝并发写链分叉（HTTP 写操作审计并发频率高，必须串行） */
  private _tail: Promise<unknown> = Promise.resolve();

  async log(entry: OperationAuditEntry): Promise<void> {
    const job = this._tail.then(async () => {
      try {
        const payload = {
          userId: entry.userId ?? null,
          action: entry.action,
          method: entry.method,
          path: entry.path,
          featureKey: entry.featureKey ?? null,
          featureFallback: entry.featureFallback ?? null,
          targetId: entry.targetId ?? null,
          requestBody: entry.requestBody ? entry.requestBody.slice(0, 2000) : null,
          ip: entry.ip ? entry.ip.slice(0, 64) : null,
          userAgent: entry.userAgent ? entry.userAgent.slice(0, 255) : null,
          statusCode: entry.statusCode ?? null,
        };
        const prevHash = await this._lastHash();
        const hash = this.auditChain.computeHash(prevHash, payload);
        const entity = this.logRepo.create({
          ...payload,
          prevHash,
          hash,
        });
        await this.logRepo.save(entity);
      } catch (err) {
        this.logger.warn(`[OperationAudit] log failed: ${(err as Error).message}`);
      }
    });
    // 串行链：失败不阻断后续写，但保持顺序
    this._tail = job.catch(() => {});
    await job;
  }

  /** HS-11：沿 id 升序校验操作审计哈希链完整性。 */
  async verifyChain(): Promise<ChainVerification> {
    const rows = await this.logRepo.find({ order: { id: 'ASC' } });
    return this.auditChain.verifyChain(rows, (row) => this._payload(row));
  }

  private async _lastHash(): Promise<string | null> {
    const row = await this.logRepo
      .createQueryBuilder('log')
      .select('log.hash', 'hash')
      .orderBy('log.id', 'DESC')
      .limit(1)
      .getRawOne<{ hash: string }>();
    return row?.hash ?? null;
  }

  private _payload(row: object): Record<string, unknown> {
    const r = row as Record<string, unknown>;
    return {
      userId: r.userId ?? null,
      action: r.action ?? null,
      method: r.method ?? null,
      path: r.path ?? null,
      featureKey: r.featureKey ?? null,
      featureFallback: r.featureFallback ?? null,
      targetId: r.targetId ?? null,
      requestBody: r.requestBody ?? null,
      ip: r.ip ?? null,
      userAgent: r.userAgent ?? null,
      statusCode: r.statusCode ?? null,
    };
  }

  /**
   * 分页查询审计日志（可按 userId 过滤）。
   * 左联用户表带出 username（原则 3：审计显示用户名）。
   */
  async getLogs(
    page = 1,
    limit = 20,
    userId?: number,
    since?: Date,
  ): Promise<{ items: Array<OperationAuditLog & { username?: string | null }>; total: number; page: number; limit: number }> {
    // CR-19 同款钳制：limit 1-100 防一次拉全量审计表
    page = Math.max(page, 1);
    limit = Math.min(Math.max(limit, 1), 100);
    const qb = this.logRepo
      .createQueryBuilder('log')
      .leftJoin('users', 'u', 'u.id = log.userId')
      .addSelect('u.username', 'username')
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (userId) qb.where('log.userId = :userId', { userId });
    if (since) qb.andWhere('log.createdAt >= :since', { since });

    const rows = await qb.getRawMany();
    const total = await this.logRepo.count({ where: since ? (userId ? { userId, createdAt: MoreThanOrEqual(since) } : { createdAt: MoreThanOrEqual(since) }) : userId ? { userId } : {} });
    const items = rows.map((r) => ({
      id: Number(r.log_id),
      userId: r.log_user_id != null ? Number(r.log_user_id) : null,
      action: r.log_action,
      method: r.log_method,
      path: r.log_path,
      featureKey: r.log_feature_key ?? null,
      featureFallback: r.log_feature_fallback ?? null,
      targetId: r.log_target_id ?? null,
      requestBody: r.log_request_body ?? null,
      ip: r.log_ip ?? null,
      userAgent: r.log_user_agent ?? null,
      statusCode: r.log_status_code != null ? Number(r.log_status_code) : null,
      createdAt: r.log_createdAt,
      username: r.username ?? null,
    }));
    return { items, total, page, limit };
  }

  /**
   * 按 action 分组的统计（since 起）。返回 { action: count }。
   */
  async getStats(since?: Date): Promise<Record<string, number>> {
    const qb = this.logRepo.createQueryBuilder('log')
      .select('log.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .groupBy('log.action');
    if (since) {
      qb.where('log.createdAt >= :since', { since });
    }
    const rows = await qb.getRawMany();
    const stats: Record<string, number> = {};
    for (const row of rows) {
      stats[row.action] = Number(row.count);
    }
    return stats;
  }
}
