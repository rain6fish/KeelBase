// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository, MoreThanOrEqual } from 'typeorm';
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
  changes?: string | null;
  businessEvent?: string | null;
  /** G-1（§22.17 ① G-1）：事件时点授权依据快照（JSON）——链外注解列 */
  authorization?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  statusCode?: number | null;
}

/** E-2 操作审计哈希链可视化：逐行链节点（verify 端点返回的切片） */
export interface OpAuditChainNode {
  id: number;
  createdAt: Date;
  action: string;
  method: string;
  path: string;
  statusCode?: number | null;
  prevHash: string | null;
  hash: string | null;
  broken?: boolean;
}

@Injectable()
export class OperationAuditService {
  private readonly logger = new Logger(OperationAuditService.name);
  /** sqlite 分支进程内串行（better-sqlite3 单连接，多 QueryRunner 并发事务不支持；sqlite 单写者） */
  private _tail: Promise<unknown> = Promise.resolve();

  constructor(
    @InjectRepository(OperationAuditLog)
    private readonly logRepo: Repository<OperationAuditLog>,
    private readonly auditChain: AuditChainService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 记录一条操作审计。落库失败静默（审计失败不应影响业务）。
   * HS-11：写入同时计算哈希链（prev_hash + hash）。
   * DB 级串行（roadmap §22.10 B）：事务内锁 audit_chain_lock id=1 行，跨实例串行化写链（替代进程内 _tail）。
   */
  async log(entry: OperationAuditEntry): Promise<void> {
    // §22.16 A-1：changes/businessEvent 是链外注解列（字段 diff + 业务事件，展示用非写操作本身事实）——
    // hash payload 不含它们（computeHash 与 _payload verify 两端一致，防破链）；存库时保留
    const hashPayload = {
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
    const savePayload = {
      ...hashPayload,
      changes: entry.changes ? entry.changes.slice(0, 4000) : null,
      businessEvent: entry.businessEvent ?? null,
      authorization: entry.authorization ? entry.authorization.slice(0, 2000) : null,
    };
    if (this.dataSource.options.type === 'postgres') {
      // postgres：DB 级串行（事务内锁 audit_chain_lock id=1），跨实例串行化写链
      const runner = this.dataSource.createQueryRunner();
      await runner.connect();
      try {
        await runner.startTransaction();
        // 锁行可能缺失（synchronize 建表不 seed / 治理台独立库）→ 先幂等 ensure，再取行锁
        await runner.query(
          `INSERT INTO "audit_chain_lock" (id, holder) VALUES (1, 'seed') ON CONFLICT (id) DO NOTHING`,
        );
        await runner.query('SELECT id FROM "audit_chain_lock" WHERE id = 1 FOR UPDATE');
        const prevHash = await this._lastHash(runner);
        const hash = this.auditChain.computeHash(prevHash, hashPayload);
        await runner.manager.save(OperationAuditLog, { ...savePayload, prevHash, hash });
        await runner.commitTransaction();
      } catch (err) {
        await runner.rollbackTransaction().catch(() => {});
        this.logger.warn(`[OperationAudit] log failed: ${(err as Error).message}`);
      } finally {
        await runner.release();
      }
    } else {
      // sqlite：进程内串行（better-sqlite3 单连接，多 QueryRunner 并发事务不支持；sqlite 单写者）
      const job = this._tail.then(async () => {
        const prevHash = await this._lastHash();
        const hash = this.auditChain.computeHash(prevHash, hashPayload);
        await this.logRepo.save({ ...savePayload, prevHash, hash });
      });
      this._tail = job.catch(() => {});
      try {
        await job;
      } catch (err) {
        this.logger.warn(`[OperationAudit] log failed: ${(err as Error).message}`);
      }
    }
  }

  /** HS-11：沿 id 升序校验操作审计哈希链完整性。返回含逐行链明细（切片，供 E-2 哈希链可视化）。 */
  async verifyChain(): Promise<ChainVerification & { chain: OpAuditChainNode[] }> {
    const rows = await this.logRepo.find({ order: { id: 'ASC' } });
    const result = this.auditChain.verifyChain(rows, (row) => this._payload(row));
    return { ...result, chain: this._chainSlice(rows, result) };
  }

  /** E-2：把全量链切成可视窗口——valid 取最近 N；broken 以断点为中心窗口（断点行标 broken）。 */
  private _chainSlice(rows: OperationAuditLog[], result: ChainVerification): OpAuditChainNode[] {
    const CHAIN_SLICE = 24;
    const b = result.brokenIndex ? result.brokenIndex - 1 : -1;
    let window: OperationAuditLog[];
    let brokenOffset = -1;
    if (result.valid || b < 0) {
      window = rows.slice(-CHAIN_SLICE);
    } else {
      const start = Math.max(0, b - 6);
      const end = Math.min(rows.length, b + 4);
      window = rows.slice(start, end);
      brokenOffset = b - start;
    }
    return window.map((row, i) => ({
      id: row.id,
      createdAt: row.createdAt,
      action: row.action,
      method: row.method,
      path: row.path,
      statusCode: row.statusCode ?? null,
      prevHash: row.prevHash ?? null,
      hash: row.hash ?? null,
      broken: i === brokenOffset,
    }));
  }

  /**
   * ① 证据根（§22.17 ①，docs/evidence-root.spec.md）：按业务对象（target_id + path 资源子串）取 REST 写链行，
   * payload 复用本服务 canonical（与写入侧一致），供跨链证据根整包离线验。
   */
  async chainRowsByTarget(
    resultId: string | number,
    pathSubstrings: string[],
  ): Promise<Array<{ seq: number; id: number; prevHash: string | null; hash: string; payload: Record<string, unknown> }>> {
    const rows = await this.findByTargetId(String(resultId), pathSubstrings);
    return rows.map((r, i) => ({
      seq: i + 1,
      id: r.id,
      prevHash: r.prevHash ?? null,
      hash: r.hash ?? '',
      payload: this._payload(r as unknown as object),
    }));
  }

  private async _lastHash(runner?: QueryRunner): Promise<string | null> {
    if (runner) {
      // DB 级串行：在锁事务内读（与插入同事务，跨实例原子）
      const rows = await runner.query('SELECT hash FROM "operation_audit_logs" ORDER BY id DESC LIMIT 1');
      return rows?.[0]?.hash ?? null;
    }
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
      changes: r.log_changes ?? null,
      businessEvent: r.log_business_event ?? null,
      authorization: r.log_authorization ?? null,
      ip: r.log_ip ?? null,
      userAgent: r.log_user_agent ?? null,
      statusCode: r.log_status_code != null ? Number(r.log_status_code) : null,
      createdAt: r.log_createdAt,
      username: r.username ?? null,
    }));
    return { items, total, page, limit };
  }

  /**
   * §22.16 A-2 业务实体行为史：按 target_id + path 资源子串反查 REST 写操作。
   * target_id 是 varchar（路径参数提取），需 String(resultId) 匹配；pathSubstrings 防跨资源 id 碰撞。
   */
  async findByTargetId(
    targetId: string,
    pathSubstrings: string[],
    since?: Date,
  ): Promise<Array<OperationAuditLog & { changes?: string | null; businessEvent?: string | null }>> {
    const qb = this.logRepo
      .createQueryBuilder('log')
      .where('log.targetId = :targetId', { targetId: String(targetId) })
      .orderBy('log.createdAt', 'ASC');
    if (since) qb.andWhere('log.createdAt >= :since', { since });
    if (pathSubstrings.length) {
      const clause = pathSubstrings.map((_, i) => `log.path LIKE :p${i}`).join(' OR ');
      const params: Record<string, string> = {};
      pathSubstrings.forEach((s, i) => { params[`p${i}`] = `%${s}%`; });
      qb.andWhere(`(${clause})`, params);
    }
    return qb.getMany();
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
