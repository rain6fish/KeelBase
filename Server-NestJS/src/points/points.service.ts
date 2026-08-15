import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PointsEntry } from './points-entry.entity';
import { User } from '../common/entities/user.entity';
import { SettingsService } from '../settings/settings.service';

const CHECKIN_BASE_KEY = 'points_checkin_base';
const CHECKIN_STREAK_PER_DAY_KEY = 'points_streak_per_day';

export interface PointsOverview {
  balance: number;
  todayCheckedIn: boolean;
  streak: number;
}

export interface LeaderboardRow {
  userId: number;
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
    const base = Number(await this.settingsService.getWithDefault(CHECKIN_BASE_KEY, 10));
    const perDay = Number(await this.settingsService.getWithDefault(CHECKIN_STREAK_PER_DAY_KEY, 1));
    const points = base + Math.max(0, streak - 1) * perDay;
    await this.entriesRepo.save(
      this.entriesRepo.create({
        userId,
        points,
        reason: 'checkin',
        description: `连续签到 ${streak} 天`,
      }),
    );
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
      userId: Number(r.userId),
      points: Number(r.points),
      nickname: userMap.get(Number(r.userId))?.nickname ?? null,
      avatarUrl: userMap.get(Number(r.userId))?.avatarUrl ?? null,
    }));
  }

  async getAchievements(userId: number): Promise<AchievementView[]> {
    const [streak, balance] = await Promise.all([
      this._checkinState(userId).then((s) => s.streak),
      this._balance(userId),
    ]);
    const defs: Array<Omit<AchievementView, 'unlocked' | 'progress'> & { current: number }> = [
      { key: 'checkin_7', name: '连续签到 7 天', current: streak, target: 7 },
      { key: 'checkin_30', name: '连续签到 30 天', current: streak, target: 30 },
      { key: 'points_100', name: '累计 100 积分', current: balance, target: 100 },
      { key: 'points_1000', name: '累计 1000 积分', current: balance, target: 1000 },
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

  /** 连签状态：今日是否已签 + 当前连签天数（未签今日则从昨日往回数，签到后自然延续）。 */
  private async _checkinState(userId: number): Promise<{ todayCheckedIn: boolean; streak: number }> {
    const entries = await this.entriesRepo.find({
      where: { userId, reason: 'checkin' },
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

  private _dayKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private _prevDay(key: string): string {
    const d = new Date(`${key}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return this._dayKey(d);
  }
}
