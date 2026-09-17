// SPDX-License-Identifier: Apache-2.0

/**
 * AU-2（§22.19 归因层）：请求级元数据（客户端 IP）——独立 AsyncLocalStorage，与 actorContext 分离。
 *
 * 由 main.ts 的全局中间件在**每个请求**上 `requestContext.run({ ip: req.ip }, next)` 设置；
 * `AuditService.log` 落库时读取填充 ai_audit_logs.ip（AI 交互可回指来源设备/IP）。
 *
 * 与 actorContext 分离的原因：actorContext 是**语义身份**（session/agent/source），由各入口控制器
 * 主动 run；而 ip 是**传输层**事实，对所有路由一致——用中间件一次设置，避免逐个控制器改签名。
 * `req.ip` 已由 `trust proxy`（AU-1）解析为真实客户端 IP（nginx 反代后）。
 *
 * AU-3（§22.19 归因层）：同一 ALS 再承载**访客标识**（`guestId`）——演示端访客共享同一账号时
 * 用它区分不同访客（落两审计表的链外列）。签发/读取见 `common/guest-id.ts`。
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import type { INestApplication } from '@nestjs/common';
import { ensureGuestId } from './guest-id';

export interface RequestContext {
  ip?: string;
  /** AU-3：访客匿名标识（与账号无关）。无 cookie/头时由中间件签发；见 guest-id.ts */
  guestId?: string;
}

/**
 * 挂载「请求级归因元数据」中间件（客户端 IP + 访客标识 → requestContext ALS）。
 *
 * **单一真源**：`main.ts` 与 e2e 的 `test/helpers.ts` 共用此函数。此前该中间件内联在 bootstrap 里，
 * 而 e2e 用 `createTestApp()` 自行组装 Nest app、**不经过 bootstrap** → 中间件在测试中缺失，
 * 任何依赖它的功能（AU-2 的 ip / AU-3 的 guestId）都拿不到 e2e 覆盖，且不为测试所察。
 *
 * 调用方须确保在 `app.set('trust proxy', …)` **之后**挂载（否则 req.ip 不是真实客户端 IP）；
 * 直连/无反代场景（如 e2e 的 supertest）保持 Express 默认「不信任」，req.ip 即 socket 地址。
 */
export function applyRequestContext(app: Pick<INestApplication, 'use'>): void {
  app.use((req: Request, res: Response, next: NextFunction) =>
    requestContext.run({ ip: req.ip, guestId: ensureGuestId(req, res) }, next),
  );
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
