import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './settings.entity';

export const SETTING_KEYS = {
  MAINTENANCE_MODE: 'maintenance_mode',
  AI_DAILY_LIMIT: 'ai_daily_limit',
  CONFIRMATION_TTL: 'confirmation_ttl_seconds',
  /** AI Bridge B 路径：proxy 工具配置（JSON：{ baseUrl, audience, tools[] }） */
  PROXY_TOOLS: 'ai_proxy_tools',
} as const;

interface ParsedValue {
  value: unknown;
  type: 'string' | 'number' | 'boolean';
}

/** 内存缓存：避免每次请求读库。写入时失效。 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private cache = new Map<string, ParsedValue>();
  private cacheReady = false;

  constructor(
    @InjectRepository(Setting) private readonly settingsRepo: Repository<Setting>,
  ) {}

  async onModuleInit() {
    await this.loadCache();
  }

  private async loadCache() {
    try {
      const rows = await this.settingsRepo.find();
      this.cache.clear();
      for (const row of rows) {
        this.cache.set(row.key, { value: this.parse(row.value, row.type), type: row.type });
      }
      this.cacheReady = true;
      this.logger.log(`Settings 加载完成: ${rows.length} 项`);
    } catch (err) {
      // 表未建好（如迁移前）时不阻断启动，读时回退默认值
      this.logger.warn(`Settings 加载失败，使用默认值: ${(err as Error).message}`);
      this.cacheReady = false;
    }
  }

  private parse(raw: string, type: Setting['type']): unknown {
    if (type === 'number') {
      const n = Number(raw);
      return Number.isNaN(n) ? 0 : n;
    }
    if (type === 'boolean') {
      return raw === 'true' || raw === '1';
    }
    return raw;
  }

  async get(key: string): Promise<unknown> {
    if (this.cacheReady) {
      return this.cache.get(key)?.value;
    }
    const row = await this.settingsRepo.findOne({ where: { key } });
    return row ? this.parse(row.value, row.type) : undefined;
  }

  async getWithDefault(key: string, fallback: unknown): Promise<unknown> {
    const value = await this.get(key);
    return value === undefined ? fallback : value;
  }

  async isMaintenanceMode(): Promise<boolean> {
    // 兼容布尔与字符串 'true'（通用 PUT /settings 未指定 type 时 value 存为 string）
    const v = await this.getWithDefault(SETTING_KEYS.MAINTENANCE_MODE, false);
    return v === true || v === 'true';
  }

  async getAiDailyLimit(): Promise<number> {
    const v = await this.getWithDefault(SETTING_KEYS.AI_DAILY_LIMIT, 0);
    return typeof v === 'number' ? v : 0;
  }

  async set(key: string, value: unknown, type?: Setting['type']): Promise<Setting> {
    const resolvedType = type ?? (typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string');
    const raw = String(value);
    let row = await this.settingsRepo.findOne({ where: { key } });
    if (row) {
      row.value = raw;
      row.type = resolvedType;
    } else {
      row = this.settingsRepo.create({ key, value: raw, type: resolvedType });
    }
    row = await this.settingsRepo.save(row);
    this.cache.set(key, { value: this.parse(raw, resolvedType), type: resolvedType });
    return row;
  }

  async findAll(): Promise<Setting[]> {
    return this.settingsRepo.find({ order: { key: 'ASC' } });
  }

  /** 测试用：重置缓存 */
  async resetCache() {
    this.cache.clear();
    this.cacheReady = false;
    await this.loadCache();
  }
}
