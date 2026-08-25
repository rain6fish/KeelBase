/**
 * Agent Identity 完整化首步（评审二 §5）：ActorContext——AI 执行时的身份/会话上下文。
 *
 * 用 AsyncLocalStorage 贯穿请求级 actor 信息，审计 log 时自动填充：
 *   - sessionId：access token 的 jti（本次访问令牌标识）
 *   - agentId：headless key 名 / 子 agent 标识（谁在替用户执行）
 * 回答「是谁让谁，在什么会话，以什么身份，对什么数据执行了什么操作」。
 *
 * 入口在 ai.controller（主链路）与 headless.controller（集成链路）用 actorContext.run() 设置；
 * AuditService.log 内部从 getStore() 读取填充审计字段（entry 显式传值优先）。
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface ActorContext {
  sessionId?: string;
  agentId?: string;
  /** D4 多 Agent 归责：父 agent 标识（子 agent 由谁调用） */
  callerAgentId?: string;
  /** D4：本次委托/子代理执行的业务意图 */
  businessIntent?: string;
}

export const actorContext = new AsyncLocalStorage<ActorContext>();
