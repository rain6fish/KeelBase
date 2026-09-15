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
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  ip?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
