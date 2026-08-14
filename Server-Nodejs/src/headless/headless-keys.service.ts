import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { HeadlessApiKey } from './headless-api-key.entity';
import { UsersService } from '../users/users.service';

export interface HeadlessKeyContext {
  id: number;
  name: string;
  ownerUserId: number;
  toolWhitelist: string[] | null;
  quotaPerDay: number;
}

const DAY_START_KEY = 'headless:quota-date';

/**
 * HS-4 headless API Key 治理：每 key 独立身份/配额/工具范围，替代单一全局 KEY。
 */
@Injectable()
export class HeadlessKeysService {
  private readonly logger = new Logger(HeadlessKeysService.name);

  constructor(
    @InjectRepository(HeadlessApiKey)
    private readonly keysRepo: Repository<HeadlessApiKey>,
    private readonly usersService: UsersService,
  ) {}

  static hashKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  static generateKey(): string {
    return randomBytes(24).toString('base64url');
  }

  /**
   * 校验 API Key：查库 + enabled + 配额，返回 key 上下文（供 controller 使用）。
   * 兼容：HEADLESS_API_KEY env 单 key 匹配时用默认上下文（owner=admin，全工具，无配额）。
   */
  async authenticate(apiKey: string, envKey: string): Promise<HeadlessKeyContext> {
    // 兼容单 key：env 值匹配 → 默认上下文（保留 AI-19 行为）
    if (envKey && apiKey === envKey) {
      return this._defaultContext();
    }
    const keyHash = HeadlessKeysService.hashKey(apiKey);
    const key = await this.keysRepo.findOne({ where: { keyHash } });
    if (!key) {
      throw new UnauthorizedException('无效的 API Key');
    }
    if (!key.enabled) {
      throw new UnauthorizedException('该 API Key 已禁用');
    }
    const ctx = {
      id: key.id,
      name: key.name,
      ownerUserId: key.ownerUserId,
      toolWhitelist: key.toolWhitelist ? (JSON.parse(key.toolWhitelist) as string[]) : null,
      quotaPerDay: key.quotaPerDay,
    };
    await this._checkAndBumpQuota(key);
    return ctx;
  }

  /** 管理台：列出全部 key */
  async list() {
    const keys = await this.keysRepo.find({ order: { createdAt: 'DESC' } });
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      ownerUserId: k.ownerUserId,
      toolWhitelist: k.toolWhitelist ? JSON.parse(k.toolWhitelist) : null,
      quotaPerDay: k.quotaPerDay,
      dailyUsed: k.dailyUsed,
      enabled: k.enabled,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    }));
  }

  /** 管理台：创建 key，返回明文（仅此一次可见） */
  async create(dto: { name: string; ownerUserId?: number; toolWhitelist?: string[]; quotaPerDay?: number }) {
    const plainKey = HeadlessKeysService.generateKey();
    const ownerUserId = dto.ownerUserId ?? (await this._findAdminId());
    const key = this.keysRepo.create({
      keyHash: HeadlessKeysService.hashKey(plainKey),
      name: dto.name,
      ownerUserId,
      toolWhitelist: dto.toolWhitelist && dto.toolWhitelist.length > 0 ? JSON.stringify(dto.toolWhitelist) : null,
      quotaPerDay: dto.quotaPerDay ?? 0,
      enabled: true,
    });
    const saved = await this.keysRepo.save(key);
    return { apiKey: plainKey, id: saved.id, name: saved.name, ownerUserId };
  }

  /** 管理台：更新 key（禁用/配额/工具范围/归属） */
  async update(id: number, dto: { name?: string; ownerUserId?: number; toolWhitelist?: string[] | null; quotaPerDay?: number; enabled?: boolean }) {
    const key = await this.keysRepo.findOne({ where: { id } });
    if (!key) throw new NotFoundException('API Key 不存在');
    if (dto.name !== undefined) key.name = dto.name;
    if (dto.ownerUserId !== undefined) key.ownerUserId = dto.ownerUserId;
    if (dto.toolWhitelist !== undefined) key.toolWhitelist = dto.toolWhitelist ? JSON.stringify(dto.toolWhitelist) : null;
    if (dto.quotaPerDay !== undefined) key.quotaPerDay = dto.quotaPerDay;
    if (dto.enabled !== undefined) key.enabled = dto.enabled;
    return this.keysRepo.save(key);
  }

  /** 管理台：删除 key */
  async remove(id: number): Promise<void> {
    await this.keysRepo.delete(id);
  }

  /** 是否存在已入库的 key（供 guard 判断端点是否可用） */
  async hasStoredKeys(): Promise<boolean> {
    const count = await this.keysRepo.count();
    return count > 0;
  }

  /** 配额校验 + 计数（按自然日） */
  private async _checkAndBumpQuota(key: HeadlessApiKey): Promise<void> {
    const today = Math.floor(Date.now() / 86400000);
    if (key.quotaDate !== today) {
      key.quotaDate = today;
      key.dailyUsed = 0;
      await this.keysRepo.save(key);
    }
    if (key.quotaPerDay > 0 && key.dailyUsed >= key.quotaPerDay) {
      throw new UnauthorizedException('该 API Key 今日配额已用完');
    }
    key.dailyUsed += 1;
    key.lastUsedAt = new Date();
    await this.keysRepo.save(key);
  }

  private async _defaultContext(): Promise<HeadlessKeyContext> {
    return {
      id: -1,
      name: 'default',
      ownerUserId: await this._findAdminId(),
      toolWhitelist: null,
      quotaPerDay: 0,
    };
  }

  private async _findAdminId(): Promise<number> {
    // admin 用户 ID：查 id=1（seed 固定 admin），找不到则回退 1
    try {
      const user = await this.usersService.findOne(1, true);
      return user.id ?? 1;
    } catch {
      return 1;
    }
  }
}
