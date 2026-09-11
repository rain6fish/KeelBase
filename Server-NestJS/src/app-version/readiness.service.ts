// SPDX-License-Identifier: Apache-2.0

import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { APP_VERSION } from './app-version.config';
import { GovernancePolicyService } from '../ai/governance/governance-policy.service';
import { SettingsService } from '../settings/settings.service';

/** 单个就绪维度：可否用 + 面向首次运行的说明 + 不满足时的下一步（可直接执行的命令/配置） */
export interface ReadinessDimension {
  ready: boolean;
  detail: string;
  nextStep: string | null;
}

export interface ReadinessReport {
  /** 核心四维（runtime/db/ai/governance）全就绪——demo 为可选，不计入该判定 */
  ready: boolean;
  checkedAt: string;
  dimensions: {
    runtime: ReadinessDimension;
    db: ReadinessDimension;
    ai: ReadinessDimension;
    governance: ReadinessDimension;
    /** 可选：演示数据是否已种（不影响 ready；仅供首次体验引导） */
    demo: ReadinessDimension;
  };
}

/**
 * 首次运行就绪清单（NC-3 DX-1，`GET /app/readiness`）：五维 + 每维「下一步」。
 *
 * 与 `GET /health?detail=true` 的分工：health 是**运维探活**（db/redis/queue/storage + 指标，给探针/告警）；
 * 本服务是**首次运行引导**（能不能跑起来 / 还差什么 / 下一步做什么，给人看），故只覆盖 runtime/db/ai/
 * governance/demo 五维，且每维必带可执行 nextStep。两者不复用彼此实现，避免把「引导文案」塞进探活契约。
 */
@Injectable()
export class ReadinessService {
  /** seed:demo 落下的标记键（值为北京时间日期）——demo 维度的判据 */
  static readonly DEMO_SEEDED_KEY = 'demo_seeded_at';

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Optional() private readonly governancePolicy?: GovernancePolicyService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  async check(): Promise<ReadinessReport> {
    const [db, governance, demo] = await Promise.all([
      this._db(),
      this._governance(),
      this._demo(),
    ]);
    const dimensions = {
      runtime: this._runtime(),
      db,
      ai: this._ai(),
      governance,
      demo,
    };
    return {
      ready: dimensions.runtime.ready && dimensions.db.ready && dimensions.ai.ready && dimensions.governance.ready,
      checkedAt: new Date().toISOString(),
      dimensions,
    };
  }

  /** Runtime：只要进程在跑、版本可读即就绪（版本单源于 package.json，见 app-version.config） */
  private _runtime(): ReadinessDimension {
    return {
      ready: true,
      detail: `KeelBase v${APP_VERSION.latestVersion}（Node ${process.version}）`,
      nextStep: null,
    };
  }

  /** DB：一次连通性探测（不引入 health 的依赖探活面，只判「库能不能用」） */
  private async _db(): Promise<ReadinessDimension> {
    const type = this.dataSource.options.type;
    try {
      await this.dataSource.query('SELECT 1');
      return { ready: true, detail: `数据库连接正常（${type}）`, nextStep: null };
    } catch {
      // 公开端点不泄露驱动原始错误（含主机/端口/凭据线索）——与 /health 一致，只报「不可用」
      return {
        ready: false,
        detail: '数据库不可用',
        nextStep: '检查 DB_* 环境变量与数据库可达性，然后重启服务',
      };
    }
  }

  /**
   * AI：判据 = **真实模型**是否配置（对齐 ai.module 的 provider 注册约定：`<PROVIDER>_API_KEY`，
   * 或本地 Ollama 的 `OLLAMA_BASE_URL`）。未配置时确定性 demo provider 仍可跑通黄金流程——
   * 故 detail 如实说明「demo 可用」，nextStep 给真实配置路径，避免把「仅 demo」误报成「AI 就绪」。
   */
  private _ai(): ReadinessDimension {
    const provider = this.config.get<string>('AI_PROVIDER', 'deepseek');
    const key = this.config.get<string>(`${provider.toUpperCase()}_API_KEY`);
    if (key) {
      return { ready: true, detail: `已配置模型供应商：${provider}`, nextStep: null };
    }
    // Ollama 仅在 AI_PROVIDER=ollama 时才是实际生效路径（FALLBACK_CHAIN 无 ollama 项；
    // docker-compose 无条件注入 OLLAMA_BASE_URL 而 AI_PROVIDER 仍默认 deepseek → 此时实际走 deepseek/demo）。
    // 判据与 CapabilitiesService.isAiProviderConfigured() 保持单源：provider==='ollama' 即算配置，
    // 否则查该 provider 的 Key——只看 OLLAMA_BASE_URL 会把「仅 demo」误报成 AI 就绪（本函数要避免的正是这个）。
    if (provider === 'ollama') {
      return { ready: true, detail: '已配置本地 Ollama（数据不出域）', nextStep: null };
    }
    return {
      ready: false,
      detail: '未配置真实模型——确定性 demo provider 仍可跑通黄金流程（无需密钥）',
      nextStep: `设置 ${provider.toUpperCase()}_API_KEY，或私有化部署并设 AI_PROVIDER=ollama`,
    };
  }

  /** Governance：治理策略可读即就绪（无策略行 = 默认策略语义，仍算就绪）；detail 区分默认/自定义 + 内容指纹版本 */
  private async _governance(): Promise<ReadinessDimension> {
    if (!this.governancePolicy) {
      return { ready: false, detail: '治理策略服务不可用', nextStep: '检查 AI 模块装配' };
    }
    try {
      const policy = await this.governancePolicy.getPolicy();
      const custom = Boolean(policy.updatedAt);
      const rev = (policy.revision ?? '').slice(0, 12);
      return {
        ready: true,
        detail: `${custom ? '已自定义' : '默认'}治理策略${rev ? `（revision ${rev}）` : ''}`,
        nextStep: null,
      };
    } catch {
      // 同上：公开端点不泄露原始错误
      return { ready: false, detail: '治理策略读取失败', nextStep: '检查治理策略表可读性' };
    }
  }

  /** Demo（可选）：seed:demo 是否跑过（标记键）——未种只提示下一步，不影响整体 ready */
  private async _demo(): Promise<ReadinessDimension> {
    if (!this.settings) {
      return { ready: false, detail: '无法读取设置（演示数据状态未知）', nextStep: 'npm run seed:demo' };
    }
    try {
      const at = await this.settings.getWithDefault(ReadinessService.DEMO_SEEDED_KEY, '');
      return at
        ? { ready: true, detail: `演示数据已种（${at}）`, nextStep: null }
        : { ready: false, detail: '演示数据未种（可选）', nextStep: 'npm run seed:demo' };
    } catch {
      // 设置读取失败（缓存/DB 抖动）不应让公开引导端点 500——与 _db/_governance 同样降级为「未知」
      return { ready: false, detail: '演示数据状态未知（可选）', nextStep: 'npm run seed:demo' };
    }
  }
}
