// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger, Optional, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource, IsNull, Not, In, MoreThanOrEqual } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { maskEmail, maskPhone } from '../common/utils/mask';
import { EncryptionService } from '../common/utils/encryption';
import { User } from '../common/entities/user.entity';
import { Event } from '../events/event.entity';
import { Todo } from '../todos/todo.entity';
import { Notification } from '../notifications/notification.entity';
import { UserSession } from '../auth/user-session.entity';
import { OperationAuditLog } from '../operation-audit/operation-audit-log.entity';
import { AiAuditLog } from '../ai/audit/ai-audit-log.entity';
import { AiConversation } from '../ai/conversation/ai-conversation.entity';
import { KnowledgeArticle } from '../ai/rag/knowledge-article.entity';
import { PmProject } from '../pm/pm-project.entity';
import { PmTask } from '../pm/pm-task.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { MetricsService } from '../metrics/metrics.service';
import { CacheService } from '../common/cache/cache.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
    @InjectRepository(Todo) private readonly todosRepo: Repository<Todo>,
    @InjectRepository(Notification) private readonly notificationsRepo: Repository<Notification>,
    @InjectRepository(UserSession) private readonly sessionsRepo: Repository<UserSession>,
    @InjectRepository(OperationAuditLog) private readonly opAuditRepo: Repository<OperationAuditLog>,
    @InjectRepository(AiAuditLog) private readonly aiAuditRepo: Repository<AiAuditLog>,
    @InjectRepository(AiConversation) private readonly convRepo: Repository<AiConversation>,
    @InjectRepository(KnowledgeArticle) private readonly knowledgeRepo: Repository<KnowledgeArticle>,
    private readonly notificationsService: NotificationsService,
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly encryption: EncryptionService,
    @Optional() @InjectQueue('push') private readonly pushQueue: Queue | null,
    // E-3 聚合端点缓存（admin 读全库 count，30s 短 TTL 自过期；未启用/不可用时直查库）
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  async getOverview(since: Date) {
    const sinceDay = Math.round((Date.now() - since.getTime()) / 86400000);
    const cached = await this.cacheService?.get<any>(`admin:overview:${sinceDay}`);
    if (cached) return cached;
    const [users, events, todos, notifications, opAudit, aiAudit] = await Promise.all([
      this.usersRepo.count(),
      this.eventsRepo.count(),
      this.todosRepo.count(),
      this.notificationsRepo.count(),
      this.opAuditRepo.count(),
      this.aiAuditRepo.count(),
    ]);
    const storage = await this._getStorageUsage();
    const trend = await this._getCountsByDay('users', since);

    const result = {
      counts: { users, events, todos, notifications, operationAuditLogs: opAudit, aiAuditLogs: aiAudit },
      storage,
      trend,
    };
    await this.cacheService?.set(`admin:overview:${sinceDay}`, result, 30_000);
    return result;
  }

  async getUserDetail(id: number) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    const { password, refreshTokenHash, loginAttempts, lockedUntil, ...rest } = user;
    delete (rest as Record<string, unknown>).bio;
    delete (rest as Record<string, unknown>).dateOfBirth;
    delete (rest as Record<string, unknown>).firstName;
    delete (rest as Record<string, unknown>).lastName;
    delete (rest as Record<string, unknown>).avatarUrl;
    delete (rest as Record<string, unknown>).provider;
    delete (rest as Record<string, unknown>).providerId;
    delete (rest as Record<string, unknown>).providerHash;
    const base = {
      ...rest,
      email: maskEmail(user.email),
      ...(user.phone ? { phone: maskPhone(this.encryption.decrypt(user.phone)) } : {}),
    } as Record<string, unknown>;

    const [sessions, notifications, opAuditCount, aiAuditCount, events, aiTokens] = await Promise.all([
      this.sessionsRepo.find({ where: { userId: id }, order: { lastActiveAt: 'DESC' } }),
      this.notificationsRepo.find({ where: { userId: id }, order: { createdAt: 'DESC' }, take: 20 }),
      this.opAuditRepo.count({ where: { userId: id } }),
      this.aiAuditRepo.count({ where: { userId: String(id) } }),
      this.eventsRepo.count({ where: { userId: id } }),
      this.aiAuditRepo
        .createQueryBuilder('log')
        .select('COALESCE(SUM(log.promptTokens), 0)', 'prompt')
        .addSelect('COALESCE(SUM(log.completionTokens), 0)', 'completion')
        .where('log.userId = :userId', { userId: String(id) })
        .getRawOne<{ prompt: string; completion: string }>(),
    ]);

    return {
      ...base,
      sessions: sessions.map((s) => ({
        id: s.id,
        deviceName: s.deviceName ?? null,
        ip: s.ip ?? null,
        lastActiveAt: s.lastActiveAt?.toISOString() ?? null,
        createdAt: s.createdAt?.toISOString() ?? null,
      })),
      notifications: notifications.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body ?? null,
        type: n.type,
        isRead: n.isRead,
        createdAt: n.createdAt?.toISOString() ?? null,
      })),
      counts: {
        events,
        operationAuditLogs: opAuditCount,
        aiAuditLogs: aiAuditCount,
        totalTokens: Number(aiTokens?.prompt ?? 0) + Number(aiTokens?.completion ?? 0),
      },
    };
  }

  async getSessions(): Promise<{ id: number; userId: number; username: string | null; deviceName: string | null; ip: string | null; createdAt: string | null; lastActiveAt: string | null }[]> {
    const rows = await this.sessionsRepo
      .createQueryBuilder('s')
      .leftJoin(User, 'u', 'u.id = s.userId')
      .select('s.id', 'id')
      .addSelect('s.userId', 'userId')
      .addSelect('u.username', 'username')
      .addSelect('s.deviceName', 'deviceName')
      .addSelect('s.ip', 'ip')
      .addSelect('s.createdAt', 'createdAt')
      .addSelect('s.lastActiveAt', 'lastActiveAt')
      .orderBy('s.lastActiveAt', 'DESC')
      .getRawMany();

    return rows.map((r) => ({
      id: Number(r.id),
      userId: Number(r.userId),
      username: r.username ?? null,
      deviceName: r.deviceName ?? null,
      ip: r.ip ?? null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      lastActiveAt: r.lastActiveAt ? new Date(r.lastActiveAt).toISOString() : null,
    }));
  }

  async revokeSession(sessionId: number): Promise<void> {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      this.logger.warn(`[Admin] session ${sessionId} not found`);
      return;
    }
    await this.sessionsRepo.delete({ id: sessionId });
    this.logger.log(`[Admin] session revoked: sessionId=${sessionId}, userId=${session.userId}`);
  }

  async broadcast(dto: { title: string; body?: string; type?: string; userIds?: number[] }) {
    const users =
      dto.userIds && dto.userIds.length > 0
        ? dto.userIds
        : (await this.usersRepo.find({ select: { id: true } })).map((u) => u.id);
    if (users.length === 0) return { sent: 0 };

    // 管理台广播默认公告类型（'broadcast'），Flutter 公告弹窗只识别 broadcast/announcement——原默认 'system' 致广播永不弹窗
    const type = dto.type || 'broadcast';
    const perUser = dto.userIds && dto.userIds.length > 0;
    let sent = 0;
    for (const userId of users) {
      try {
        await this.notificationsService.create({
          userId,
          title: dto.title,
          body: dto.body,
          type,
        });
        sent += 1;
      } catch (err) {
        this.logger.warn(`[Admin] broadcast to userId=${userId} failed: ${(err as Error).message}`);
      }
    }
    return { sent, mode: perUser ? 'selected' : 'all' };
  }

  /**
   * RG-3 回收站：列出已软删除的 events + todos（带用户名，按删除时间倒序）。
   */
  async getTrash(page = 1, limit = 20) {
    // 级联撤销的可恢复面（docs/cascade-compensation.spec.md §7）：复合写落在 pm_projects/pm_tasks，
    // 二者均带 @DeleteDateColumn，若不进回收站则「本地可撤」的「可经 RG-3 恢复」承诺对它们不成立
    // （create_project_task 早已如此）。用**已注入的 dataSource** 取这两张表，避免为两处只读访问
    // 给构造函数再加两个 repo 依赖（牵连 5 处测试装配）。
    const projectsRepo = this.dataSource.getRepository(PmProject);
    const tasksRepo = this.dataSource.getRepository(PmTask);
    const softDeleted = {
      withDeleted: true,
      where: { deletedAt: Not(IsNull()) },
      order: { deletedAt: 'DESC' as const },
      skip: (page - 1) * limit,
      take: limit,
    };
    const [events, todos, projects, tasks] = await Promise.all([
      this.eventsRepo.find({
        withDeleted: true,
        where: { deletedAt: Not(IsNull()) },
        order: { deletedAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.todosRepo.find({
        withDeleted: true,
        where: { deletedAt: Not(IsNull()) },
        order: { deletedAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      projectsRepo.find(softDeleted),
      tasksRepo.find(softDeleted),
    ]);

    const userIds = new Set<number>(
      [...events, ...todos, ...projects, ...tasks]
        .map((i) => i.userId)
        .filter((v): v is number => v != null),
    );
    const users = userIds.size
      ? await this.usersRepo.find({ where: { id: In([...userIds]) }, select: { id: true, username: true } })
      : [];
    const usernameById = new Map(users.map((u) => [u.id, u.username]));

    const items = [
      ...events.map((e) => ({
        type: 'event' as const,
        id: e.id,
        title: e.title,
        userId: e.userId,
        username: e.userId != null ? usernameById.get(e.userId) ?? null : null,
        deletedAt: e.deletedAt?.toISOString() ?? null,
      })),
      ...todos.map((t) => ({
        type: 'todo' as const,
        id: t.id,
        title: t.title,
        userId: t.userId,
        username: t.userId != null ? usernameById.get(t.userId) ?? null : null,
        deletedAt: t.deletedAt?.toISOString() ?? null,
      })),
      // 项目展示列是 name（非 title）——与 resolveLocalEntity 的 displayCol 推导同口径
      ...projects.map((p) => ({
        type: 'project' as const,
        id: p.id,
        title: p.name,
        userId: p.userId,
        username: p.userId != null ? usernameById.get(p.userId) ?? null : null,
        deletedAt: p.deletedAt?.toISOString() ?? null,
      })),
      ...tasks.map((t) => ({
        type: 'task' as const,
        id: t.id,
        title: t.title,
        userId: t.userId,
        username: t.userId != null ? usernameById.get(t.userId) ?? null : null,
        deletedAt: t.deletedAt?.toISOString() ?? null,
      })),
    ].sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));

    const [totalEvents, totalTodos, totalProjects, totalTasks] = await Promise.all([
      this.eventsRepo.count({ withDeleted: true, where: { deletedAt: Not(IsNull()) } }),
      this.todosRepo.count({ withDeleted: true, where: { deletedAt: Not(IsNull()) } }),
      projectsRepo.count({ withDeleted: true, where: { deletedAt: Not(IsNull()) } }),
      tasksRepo.count({ withDeleted: true, where: { deletedAt: Not(IsNull()) } }),
    ]);
    const total = totalEvents + totalTodos + totalProjects + totalTasks;

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** RG-3 恢复一条软删除记录。 */
  async restoreTrashItem(type: 'event' | 'todo' | 'project' | 'task', id: number) {
    // `type` is only a compile-time union — it arrives from a route parameter, so an unvalidated
    // value (`/admin/trash/bogus/1/restore`) used to fall through the ternary chain into the PmTask
    // branch and restore a project task instead of failing. Reject explicitly.
    //
    // `type` 只是编译期联合，实际来自路由参数：未经校验的值（`/admin/trash/bogus/1/restore`）
    // 曾穿过三元链落到 PmTask 分支，恢复出错的东西而不是报错。此处显式拒绝。
    const allowedTrashTypes = ['event', 'todo', 'project', 'task'];
    if (!allowedTrashTypes.includes(type as string)) {
      throw new BadRequestException(`未知的回收站类型：${type}`);
    }
    const repo =
      type === 'event'
        ? this.eventsRepo
        : type === 'todo'
          ? this.todosRepo
          : this.dataSource.getRepository(type === 'project' ? PmProject : PmTask);
    const item = await repo.findOne({
      withDeleted: true,
      where: { id, deletedAt: Not(IsNull()) },
    });
    if (!item) {
      throw new NotFoundException('回收站中无此记录');
    }
    await repo.restore(id);
    this.logger.log(`[Admin] restored ${type} #${id}`);
    return { restored: true, type, id };
  }

  private async _getStorageUsage(): Promise<{ driver: string; bytes: number | null }> {
    const driver = this.configService.get<string>('STORAGE_DRIVER', 'local');
    if (driver !== 'local') return { driver, bytes: null };
    try {
      const fs = await import('fs');
      const path = await import('path');
      const uploadsDir = path.resolve(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) return { driver, bytes: 0 };
      let bytes = 0;
      for (const f of fs.readdirSync(uploadsDir)) {
        const stat = fs.statSync(path.join(uploadsDir, f));
        if (stat.isFile()) bytes += stat.size;
      }
      return { driver, bytes };
    } catch {
      return { driver, bytes: null };
    }
  }

  /**
   * PL-15 平台数据统计：DAU/MAU/留存 + 功能使用漏斗 + 错误大盘。
   * 复用审计日志（op_audit_logs / ai_audit_logs）与用户表，原始 SQL 跨库。
   */
  async getAnalytics(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - Math.min(Math.max(days, 1), 90));
    const sinceIso = since.toISOString();
    // 日表达式跨 sqlite/postgres（同 _getAuditTrend）：DATE() 是 sqlite 专有，pg 用 to_char，否则 pg 下静默空
    const isPg = this.dataSource.options?.type === 'postgres';
    const dayExpr = isPg ? "to_char(createdAt, 'YYYY-MM-DD')" : 'DATE(createdAt)';

    const run = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      try {
        return (await this.dataSource.query(sql, params)) as T[];
      } catch (err) {
        this.logger.warn(`[Admin] analytics query failed: ${(err as Error).message}`);
        return [];
      }
    };
    // 时间边界用 JS 计算（跨 sqlite/postgres），避免 sqlite 专用 datetime() 语法
    const day7 = new Date();
    day7.setDate(day7.getDate() - 7);
    const day30 = new Date();
    day30.setDate(day30.getDate() - 30);

    // DAU / MAU：按操作审计日志的去重 userId 估算活跃（跨表最简：用 op_audit_logs 的 userId）
    const [daily, mauRow, wauRow, totalUsersRow] = await Promise.all([
      run<{ date: string; dau: number | string }>(
        `SELECT ${dayExpr} AS date, COUNT(DISTINCT userId) AS dau FROM op_audit_logs
         WHERE createdAt >= ? GROUP BY ${dayExpr} ORDER BY date ASC`, [sinceIso]),
      run<{ mau: number | string }>(
        `SELECT COUNT(DISTINCT userId) AS mau FROM op_audit_logs WHERE createdAt >= ?`, [sinceIso]),
      run<{ mu: number | string }>(
        `SELECT COUNT(DISTINCT userId) AS mu FROM op_audit_logs WHERE createdAt >= ?`, [day7.toISOString()]),
      run<{ total: number | string }>(`SELECT COUNT(*) AS total FROM users`),
    ]);

    const totalUsers = Number(totalUsersRow[0]?.total ?? 0);
    const mau = Number((mauRow[0] as { mau?: number | string })?.mau ?? 0);
    const wau = Number((wauRow[0] as { mu?: number | string })?.mu ?? 0);

    // 留存：近 7 天活跃用户中有多少在过去 7-30 天也活跃过（简化版）
    const [retainedRow, mau30Row] = await Promise.all([
      run<{ r: number | string }>(
        `SELECT COUNT(DISTINCT a.userId) AS r FROM op_audit_logs a
         WHERE a.createdAt >= ?
           AND EXISTS (SELECT 1 FROM op_audit_logs b
             WHERE b.userId = a.userId AND b.createdAt >= ? AND b.createdAt < ?)`,
        [day7.toISOString(), day30.toISOString(), day7.toISOString()]),
      run<{ m: number | string }>(
        `SELECT COUNT(DISTINCT userId) AS m FROM op_audit_logs WHERE createdAt >= ?`, [day30.toISOString()]),
    ]);
    const retained = Number(retainedRow[0]?.r ?? 0);
    const mau30 = Number(mau30Row[0]?.m ?? 0);

    // 功能使用漏斗：按操作审计的 action 分组
    const funnel = await run<{ action: string; count: number | string }>(
      `SELECT action, COUNT(*) AS count FROM op_audit_logs WHERE createdAt >= ? GROUP BY action ORDER BY count DESC LIMIT 20`, [sinceIso]);

    // 错误大盘：AI 审计的错误数 + 近 N 天趋势
    const [aiErrors, errorTrend] = await Promise.all([
      run<{ errors: number | string }>(
        `SELECT COUNT(*) AS errors FROM ai_audit_logs WHERE isError = 1 AND createdAt >= ?`, [sinceIso]),
      run<{ date: string; errors: number | string }>(
        `SELECT ${dayExpr} AS date, COUNT(*) AS errors FROM ai_audit_logs
         WHERE isError = 1 AND createdAt >= ? GROUP BY ${dayExpr} ORDER BY date ASC`, [sinceIso]),
    ]);

    return {
      period: { days },
      activeUsers: {
        daily: daily.map((r) => ({ date: String(r.date), count: Number(r.dau) })),
        wau,
        mau,
        totalUsers,
      },
      retention: {
        // 7 天前活跃且近 7 天也活跃 / 近 30 天活跃
        ratePct: mau30 > 0 ? Math.round((retained / mau30) * 10000) / 100 : 0,
        retained,
        activeLast30d: mau30,
      },
      featureFunnel: funnel.map((r) => ({ action: r.action, count: Number(r.count) })),
      errors: {
        aiErrors: Number(aiErrors[0]?.errors ?? 0),
        trend: errorTrend.map((r) => ({ date: String(r.date), count: Number(r.errors) })),
      },
    };
  }

  private async _getCountsByDay(table: string, since: Date): Promise<Array<{ date: string; count: number }>> {
    try {
      const isPg = this.dataSource.options?.type === 'postgres';
      const dayExpr = isPg ? "to_char(createdAt, 'YYYY-MM-DD')" : 'DATE(createdAt)';
      const rows = await this.dataSource.query(
        `SELECT ${dayExpr} AS date, COUNT(*) AS count FROM ${table} WHERE createdAt >= ? GROUP BY ${dayExpr} ORDER BY date ASC`,
        [since.toISOString()],
      );
      return (rows as Array<{ date: string; count: number | string }>).map((r) => ({
        date: String(r.date),
        count: Number(r.count),
      }));
    } catch {
      return [];
    }
  }

  /**
   * D.8 运维单页聚合：派生告警 + 关键指标 + 近 24h 错误摘要 + 7 天操作趋势。
   * 让运维在管理台「运维」页一页看懂（服务/依赖/错误率/日志/告警），不跳四套监控系统。
   */
}
