// SPDX-License-Identifier: Apache-2.0

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { isPrivateLiteralHost } from '../common/utils/ssrf';

/**
 * B2 治理策略实时推送（治理能力 2.2 控制平面实时性）：
 * sidecar 启动时注册回调地址（SIDECAR_CALLBACK_URL）→ 治理台策略变更（apply-preset / PUT policy）
 * 后广播 POST {callbackUrl}/v1/policy，sidecar 秒级生效（无需等 60s 轮询）。
 * 轮询（SIDECAR_POLICY_REFRESH_SECONDS）仍保留作兜底（推送失败 / sidecar 重启 / 漏注册）。
 */
@Injectable()
export class SidecarRegistryService {
  private readonly logger = new Logger(SidecarRegistryService.name);
  private readonly sidecars = new Map<string, { callbackUrl: string; registeredAt: number }>();

  /** sidecar 注册回调（幂等：同 URL 覆盖 registeredAt）。 */
  register(callbackUrl: string): { registered: boolean; total: number } {
    if (!callbackUrl || !/^https?:\/\/\S+$/.test(callbackUrl)) {
      throw new BadRequestException('callbackUrl 必填且需为 http(s) 地址');
    }
    // SSRF 纵深（治理台暴露公网前补，复用 common/utils/ssrf）：拒**字面**私网/回环/链接本地/云元数据 IP。
    // 只判字面 IP —— **不解析主机名**：本特性的标准部署恰用内网主机名（如 `http://sidecar:3200`，
    // 见 docs/manual/governance-deploy.md），DNS 解析式拦截（assertPublicUrl）会把它一起挡掉。
    let hostname: string;
    try {
      hostname = new URL(callbackUrl).hostname;
    } catch {
      throw new BadRequestException('callbackUrl 必填且需为 http(s) 地址');
    }
    if (isPrivateLiteralHost(hostname)) {
      throw new BadRequestException('callbackUrl 不得指向私网/回环/链路本地地址（防 SSRF）');
    }
    this.sidecars.set(callbackUrl, { callbackUrl, registeredAt: Date.now() });
    return { registered: true, total: this.sidecars.size };
  }

  /** 已注册 sidecar 列表（诊断/管理用） */
  list(): Array<{ callbackUrl: string; registeredAt: number }> {
    return [...this.sidecars.values()];
  }

  /**
   * 策略变更后广播推送（fire-and-forget，单 sidecar 失败不影响其他；失败由轮询兜底）。
   * 返回推送成功/失败数。
   */
  async pushPolicy(policy: unknown): Promise<{ pushed: number; failed: number }> {
    let pushed = 0;
    let failed = 0;
    for (const { callbackUrl } of this.sidecars.values()) {
      try {
        const res = await fetch(`${callbackUrl.replace(/\/$/, '')}/v1/policy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.GOVERNANCE_API_KEY || '',
          },
          body: JSON.stringify({ policy, pushedAt: new Date().toISOString() }),
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) pushed += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    this.logger.debug(`policy push → ${pushed} ok / ${failed} fail（sidecar=${this.sidecars.size}）`);
    return { pushed, failed };
  }
}
