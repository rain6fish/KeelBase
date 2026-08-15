import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import { PointsEntry } from './points-entry.entity';
import { User } from '../common/entities/user.entity';
import { SettingsService } from '../settings/settings.service';

const CHECKIN_BASE_KEY = 'points_checkin_base';
const CHECKIN_STREAK_PER_DAY_KEY = 'points_streak_per_day';

/** 连签状态回看窗口：只统计最近 40 天签到，避免无界加载全部历史 */
const CHECKIN_LOOKBACK_DAYS = 40;

export interface PointsOverview {
  balance: number;
  todayCheckedIn: boolean;
  streak: number;
}

export interface LeaderboardRow {
  points: number;
  nickname: string | null;
  avatarUrl: string | null;
}

export interface AchievementView {
  key: string;
  name: string;
  unlocked: boolean;
  progress: number;
  target: number;
}

/** GROWTH-3：积分 / 每日签到 / 排行榜 / 成就。积分值走 Settings 运营可配。 */
@Injectable()
export class PointsService {
  constructor(
    @InjectRepository(PointsEntry) private entriesRepo: Repository<PointsEntry>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    private settingsService: SettingsService,
  ) {}

  async getMyOverview(userId: number): Promise<PointsOverview> {
    const [balance, checkin] = await Promise.all([
      this._balance(userId),
      this._checkinState(userId),
    ]);
    return { balance, todayCheckedIn: checkin.todayCheckedIn, streak: checkin.streak };
  }

  async checkIn(userId: number): Promise<{ points: number; balance: number; streak: number }> {
    const state = await this._checkinState(userId);
    if (state.todayCheckedIn) throw new ConflictException('今天已签到');
    const streak = state.streak + 1;
    const base = this._pointsValue(
      await this.settingsService.getWithDefault(CHECKIN_BASE_KEY, 10),
      10,
    );
    const perDay = this._pointsValue(
      await this.settingsService.getWithDefault(CHECKIN_STREAK_PER_DAY_KEY, 1),
      1,
    );
    const points = base + Math.max(0, streak - 1) * perDay;
    try {
      await this.entriesRepo.save(
        this.entriesRepo.create({
          userId,
          points,
          reason: 'checkin',
          description: `连续签到 ${streak} 天`,
          checkinDate: this._dayKey(new Date()),
        }),
      );
    } catch (err) {
      // A1 竞态兜底：唯一约束 (user_id, checkin_date) 兜住并发重复签到
      if (this._isUniqueViolation(err)) throw new ConflictException('今天已签到');
      throw err;
    }
    return { points, balance: await this._balance(userId), streak };
  }

  async getLeaderboard(limit = 20): Promise<LeaderboardRow[]> {
    const capped = Math.min(Math.max(limit, 1), 100);
    const rows = await this.entriesRepo
      .createQueryBuilder('e')
      .select('e.userId', 'userId')
      .addSelect('SUM(e.points)', 'points')
      .groupBy('e.userId')
      .orderBy('"points"', 'DESC')
      .limit(capped)
      .getRawMany<{ userId: number; points: number }>();
    if (rows.length === 0) return [];
    const ids = rows.map((r) => Number(r.userId));
    const users = await this.usersRepo.find({ where: { id: In(ids) } });
    const userMap = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      // A9：不返回内部 userId（避免枚举）
      points: Number(r.points),
      nickname: userMap.get(Number(r.userId))?.nickname ?? null,
      avatarUrl: userMap.get(Number(r.userId))?.avatarUrl ?? null,
    }));
  }

  async getAchievements(userId: number): Promise<AchievementView[]> {
    const [streak, earned] = await Promise.all([
      this._checkinState(userId).then((s) => s.streak),
      this._earnedTotal(userId),
    ]);
    const defs: Array<Omit<AchievementView, 'unlocked' | 'progress'> & { current: number }> = [
      { key: 'checkin_7', name: '连续签到 7 天', current: streak, target: 7 },
      { key: 'checkin_30', name: '连续签到 30 天', current: streak, target: 30 },
      { key: 'points_100', name: '累计 100 积分', current: earned, target: 100 },
      { key: 'points_1000', name: '累计 1000 积分', current: earned, target: 1000 },
    ];
    return defs.map((d) => ({
      key: d.key,
      name: d.name,
      unlocked: d.current >= d.target,
      progress: Math.min(d.current, d.target),
      target: d.target,
    }));
  }

  private async _balance(userId: number): Promise<number> {
    const row = await this.entriesRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.points), 0)', 'sum')
      .where('e.userId = :userId', { userId })
      .getRawOne<{ sum: number }>();
    return Number(row?.sum ?? 0);
  }

  /** A5：毛累计——只累计正分（签到/成就/运营奖励），admin 扣分不回退成就进度 */
  private async _earnedTotal(userId: number): Promise<number> {
    const row = await this.entriesRepo
      .createQueryBuilder('e')
      .select(
        'COALESCE(SUM(CASE WHEN e.points > 0 THEN e.points ELSE 0 END), 0)',
        'sum',
      )
      .where('e.userId = :userId', { userId })
      .getRawOne<{ sum: number }>();
    return Number(row?.sum ?? 0);
  }

  /** A13：积分值校验——NaN 或负值回退默认值 */
  private _pointsValue(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
  }

  /** 连签状态：今日是否已签 + 当前连签天数（未签今日则从昨日往回数，签到后自然延续）。 */
  private async _checkinState(userId: number): Promise<{ todayCheckedIn: boolean; streak: number }> {
    // A6：只取最近 40 天签到（更长连签不可能存在，40 天下界已足够）
    const since = new Date(Date.now() - CHECKIN_LOOKBACK_DAYS * 86400000);
    const entries = await this.entriesRepo.find({
      where: { userId, reason: 'checkin', createdAt: MoreThanOrEqual(since) },
      select: { createdAt: true },
      order: { createdAt: 'DESC' },
    });
    const dates = new Set(entries.map((e) => this._dayKey(e.createdAt)));
    const today = this._dayKey(new Date());
    const yesterday = this._dayKey(new Date(Date.now() - 86400000));
    const todayCheckedIn = dates.has(today);
    let streak = 0;
    let cursor = todayCheckedIn ? today : yesterday;
    while (dates.has(cursor)) {
      streak += 1;
      cursor = this._prevDay(cursor);
    }
    return { todayCheckedIn, streak };
  }

  /** A7：连签日键统一用 UTC（跨时区/DST 不错算），与 checkin_date 列一致 */
  private _dayKey(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private _prevDay(key: string): string {
    const d = new Date(`${key}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return this._dayKey(d);
  }

  /** 识别唯一约束冲突（sqlite: SQLITE_CONSTRAINT / postgres: 23505） */
  private _isUniqueViolation(err: unknown): boolean {
    const e = err as any;
    const code = String(e?.code ?? e?.driverError?.code ?? '');
    const msg = String(e?.message ?? e?.driverError?.message ?? '');
    return (
      code === '23505' ||
      code === 'SQLITE_CONSTRAINT' ||
      /UNIQUE constraint failed|duplicate key value/i.test(msg)
    );
  }
}
