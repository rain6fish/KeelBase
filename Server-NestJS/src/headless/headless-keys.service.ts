// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { HeadlessApiKey } from './headless-api-key.entity';
import { UsersService } from '../users/users.service';

export interface HeadlessKeyContext {
  id: number;
  name: string;
  ownerUserId: number;
  /**
   * 属主用户名 —— D2-1c 快照的来源：审计行在**写入时刻**记下主体名字，独立治理库（没有 users 表）
   * 才能显示「谁做的」，不必回查业务库。此前 headless 入口只给到 `userId`，名字是空的。
   *
   * 解析是 best-effort：属主被硬删时留 `undefined`（那一行 `username` 为空），不让一次查名失败
   * 挡掉整个集成调用 —— 这里缺名字只是归责少一段，不该升级成一次拒绝服务。
   */
  ownerUsername?: string;
  toolWhitelist: string[] | null;
  quotaPerDay: number;
}

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
    // codeql[js/insufficient-password-hash] API key 为 randomBytes(24)（192 位高熵），sha256 存储无爆破风险；改 HMAC 会使存量 key 失效
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
      ownerUsername: await this._usernameOf(key.ownerUserId),
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

  /** 配额校验 + 计数（按自然日）。用原子 UPDATE 递增 + where 配额条件，防并发请求读-改-写覆盖导致超配额。 */
  private async _checkAndBumpQuota(key: HeadlessApiKey): Promise<void> {
    const today = Math.floor(Date.now() / 86400000);
    if (key.quotaDate !== today) {
      await this.keysRepo.update(key.id, { quotaDate: today, dailyUsed: 0 });
      key.quotaDate = today;
      key.dailyUsed = 0;
    }
    const criteria: any = { id: key.id };
    if (key.quotaPerDay > 0) criteria.dailyUsed = LessThan(key.quotaPerDay);
    const result = await this.keysRepo.update(criteria, {
      dailyUsed: () => 'dailyUsed + 1',
      lastUsedAt: new Date(),
    });
    if (result.affected === 0) throw new UnauthorizedException('该 API Key 今日配额已用完');
  }

  private async _defaultContext(): Promise<HeadlessKeyContext> {
    const ownerUserId = await this._findAdminId();
    return {
      id: -1,
      name: 'default',
      ownerUserId,
      ownerUsername: await this._usernameOf(ownerUserId),
      toolWhitelist: null,
      quotaPerDay: 0,
    };
  }

  /**
   * 属主用户名，供 D2-1c 快照使用（见 `HeadlessKeyContext.ownerUsername`）。
   * best-effort：属主已被硬删时返回 undefined，让审计那一列留空，而不是让这次调用失败。
   */
  private async _usernameOf(ownerUserId: number): Promise<string | undefined> {
    try {
      return (await this.usersService.findOne(ownerUserId, true)).username;
    } catch {
      return undefined;
    }
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
