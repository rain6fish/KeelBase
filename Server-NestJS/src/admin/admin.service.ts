// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger, Optional, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource, IsNull, Not, In, MoreThanOrEqual } from 'typeorm';
import type { EntityTarget } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { maskEmail, maskPhone } from '../common/utils/mask';
import { pickDisplayColumn, pickOwnerColumn } from '../common/utils/entity-metadata';
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
import { NotificationsService } from '../notifications/notifications.service';
import { MetricsService } from '../metrics/metrics.service';
import { CacheService } from '../common/cache/cache.service';

/**
 * Entity classes whose trash `type` keeps a name older than the derived one.
 *
 * `PmProject` / `PmTask` were called `project` / `task` back when the trash hardcoded four types,
 * and the console still labels them that way. The derived spelling would be `pmproject`, which is
 * worse to read anyway, so the legacy names stay the ones **emitted** — and both are accepted on
 * restore, so nothing that already works has to change.
 *
 * 垃圾桶 `type` 保留旧名的实体类。`PmProject` / `PmTask` 在回收站硬编码四类时就叫 `project` /
 * `task`，管理台的标签也还是它们。派生出来的拼法是 `pmproject`，本来也更难读，所以旧名继续作为
 * **输出**的 type —— 而恢复时两种拼法都接受，于是已经能用的东西一件都不用改。
 */
const LEGACY_TRASH_TYPES: Record<string, string> = { PmProject: 'project', PmTask: 'task' };

/**
 * Entities that are soft-deletable but deliberately kept out of the trash.
 *
 * Empty, and it should stay that way. A record that can be soft-deleted but has no way back is
 * exactly what this list exists to make **visible** rather than to permit: an entry here is a
 * deliberate decision that a deletion is final, and it needs a reason next to it.
 *
 * **软删、但有意不进回收站的实体。**
 *
 * 今天是空的，且应当一直如此。「能软删却没有回头路」正是这份清单存在的意义 —— 让它**可见**，
 * 而不是让它合法：往这里加一条，等于有意决定某类记录的删除是终局的，必须紧挨着写明理由。
 */
export const TRASH_EXEMPT_ENTITY_NAMES: string[] = [];

/** One derived trash entry: what the API calls it, and how to read and restore it. */
/* 一条派生的回收站条目：API 管它叫什么，以及怎么读、怎么恢复。 */
interface TrashTarget {
  type: string;
  entityClass: EntityTarget<any>;
  displayCol: string | null;
  ownerCol: string | null;
}

/** One trash row, exactly as the API returns it (username filled in later). */
/* 回收站的一行，形状即接口返回（username 稍后补）。 */
interface TrashRow {
  type: string;
  id: number;
  title: string | null;
  userId: number | null;
  deletedAt: string | null;
}

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
   * The trash surface, **derived from TypeORM metadata**: every entity carrying
   * `@DeleteDateColumn`, minus the (empty) exemption list.
   *
   * Deriving rather than listing is the whole point. A hand-kept list of four types is why twelve
   * soft-deletable entities — including every module the generator produces — had no way back:
   * the list and the schema are two authorities, and the schema is the one that changes when
   * someone adds an entity. Derived, the invariant "whatever can be soft-deleted can be restored"
   * holds **by construction** instead of by remembering. (The cascade-compensation promise in
   * docs/cascade-compensation.spec.md §7 relied on two of those twelve being listed by hand; it is
   * now a special case of the general rule.)
   *
   * 回收站的覆盖面**由 TypeORM 元数据派生**：凡带 `@DeleteDateColumn` 的实体，减去（今天为空的）
   * 豁免清单。
   *
   * 派生而非列清单正是重点。一份手工维护的四类清单，就是十二个可软删实体 —— 含生成器产出的
   * **每一个**模块 —— 没有回头路的原因：清单与 schema 是两个权威，而**加实体时变的是 schema**。
   * 派生之后，「能软删的就能恢复」**由构造成立**，而不是靠记得。（cascade-compensation 承诺里
   * 那两条靠手工登记的，现在是一条普遍规则的特例。）
   */
  private _trashTargets(): TrashTarget[] {
    return this.dataSource.entityMetadatas
      .filter((md) => !!md.deleteDateColumn && !TRASH_EXEMPT_ENTITY_NAMES.includes(md.name))
      .map((md) => ({
        type: LEGACY_TRASH_TYPES[md.name] ?? md.name.toLowerCase(),
        entityClass: md.target,
        displayCol: pickDisplayColumn(md),
        ownerCol: pickOwnerColumn(md),
      }));
  }

  /**
   * Reads one entity's soft-deleted rows with a **narrow projection** and maps them to the API's
   * row shape. Only `id`, `deletedAt` and whichever columns the row is *displayed* by are read —
   * never the whole row, which for some entities would drag personal data into an admin listing.
   *
   * 用**窄投影**读一个实体的软删行，并映射成接口的行形状。只读 `id`、`deletedAt`，以及这一行
   * **用来展示**的那两列 —— 从不读整行：对某些实体，读整行会把个人数据拖进管理端列表。
   */
  private async _findSoftDeleted(t: TrashTarget): Promise<TrashRow[]> {
    // TypeORM 1.x dropped the string-array form of `select`; the object form is the only one.
    // （单测把 repo mock 掉了，看不见这个 —— 是 e2e 抓到的。）
    const select: Record<string, true> = { id: true, deletedAt: true };
    if (t.displayCol) select[t.displayCol] = true;
    if (t.ownerCol) select[t.ownerCol] = true;

    const found = (await this.dataSource.getRepository(t.entityClass).find({
      withDeleted: true,
      where: { deletedAt: Not(IsNull()) },
      select,
      order: { deletedAt: 'DESC' },
    })) as unknown as Array<Record<string, unknown>>;

    return found.map((row) => {
      const display = t.displayCol ? row[t.displayCol] : null;
      const owner = t.ownerCol ? row[t.ownerCol] : null;
      return {
        type: t.type,
        id: row['id'] as number,
        title: display == null ? null : String(display),
        userId: typeof owner === 'number' ? owner : null,
        deletedAt: row['deletedAt'] ? (row['deletedAt'] as Date).toISOString() : null,
      };
    });
  }

  /**
   * RG-3 回收站：列出**每一个**可软删实体里已软删的行（带用户名，按删除时间倒序）。
   *
   * Sorting and slicing happen **once, globally**. The previous implementation took a page *per
   * entity type* and merged them, so one page could return four times `limit` rows and item order
   * was inconsistent across pages; with the type count now following the schema, that shape would
   * only get worse. It costs one narrow read per soft-deletable entity — the trash is admin-only
   * and these are deleted rows.
   *
   * 排序与切页**只做一次，全局做**。旧实现是**每类各取一页**再合并 ⇒ 一页最多返回四倍 `limit` 行，
   * 且条目顺序跨页不一致；类型数如今随 schema 走，那个形状只会更糟。代价是每个可软删实体读一次窄
   * 投影 —— 回收站仅管理员可见，而这些是已删除的行。
   */
  async getTrash(page = 1, limit = 20) {
    const rows = await Promise.all(this._trashTargets().map((t) => this._findSoftDeleted(t)));

    const merged = rows
      .flat()
      .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
    const total = merged.length;
    const slice = merged.slice((page - 1) * limit, page * limit);

    const userIds = new Set<number>(
      slice.map((r) => r.userId).filter((v): v is number => v != null),
    );
    const users = userIds.size
      ? await this.usersRepo.find({ where: { id: In([...userIds]) }, select: { id: true, username: true } })
      : [];
    const usernameById = new Map(users.map((u) => [u.id, u.username]));

    const items = slice.map((r) => ({
      ...r,
      username: r.userId != null ? usernameById.get(r.userId) ?? null : null,
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** RG-3 恢复一条软删除记录。`type` 取派生集合（含旧别名）里的值。 */
  async restoreTrashItem(type: string, id: number) {
    // `type` arrives from a route parameter, so anything outside the derived set is rejected
    // rather than falling through into some branch and restoring the wrong record. (The old
    // ternary chain did exactly that for an unvalidated value.)
    //
    // `type` 来自路由参数：派生集合之外的取值一律拒绝，而不是落进某个分支去恢复错的记录。
    // （旧的三元链对未校验的取值正是那样。）
    const target = this._trashTargets().find((t) => t.type === type);
    if (!target) {
      throw new BadRequestException(`未知的回收站类型：${type}`);
    }
    const repo = this.dataSource.getRepository(target.entityClass);
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
