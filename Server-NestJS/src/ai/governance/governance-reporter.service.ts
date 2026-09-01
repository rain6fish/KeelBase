// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** D2-3b 业务系统 → 治理台上报服务注入 token（治理台自身不提供，业务系统提供） */
export const GOVERNANCE_REPORTER = 'GOVERNANCE_REPORTER';

/**
 * D2-3b 业务系统侧治理上报：配置 GOVERNANCE_URL + GOVERNANCE_API_KEY 后，
 * AI 审计/副作用写本地库的同时异步上报独立治理台（双写过渡）。
 * 未配置 GOVERNANCE_URL → enabled=false，完全本地（默认行为不变）。
 */
@Injectable()
export class GovernanceReporter {
  private readonly baseUrl: string | null;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('GOVERNANCE_URL') || null;
    this.apiKey = config.get<string>('GOVERNANCE_API_KEY') || '';
  }

  get enabled(): boolean {
    return !!this.baseUrl;
  }

  /** 上报审计事件到治理台 /external/audit（失败静默，不阻塞主流程） */
  async reportAudit(entry: Record<string, unknown>): Promise<void> {
    if (!this.enabled) return;
    try {
      await fetch(`${this.baseUrl}/api/v1/external/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
        body: JSON.stringify(entry),
      });
    } catch {
      // 上报失败不阻塞本地审计/工具执行
    }
  }

  /** 上报 AI 写副作用到治理台 /external/effects（幂等键去重，失败静默） */
  async reportEffect(effect: Record<string, unknown>): Promise<void> {
    if (!this.enabled) return;
    try {
      await fetch(`${this.baseUrl}/api/v1/external/effects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
        body: JSON.stringify(effect),
      });
    } catch {
      // 上报失败不阻塞本地副作用
    }
  }
}
