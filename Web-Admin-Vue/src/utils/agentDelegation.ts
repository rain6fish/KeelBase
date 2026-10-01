// SPDX-License-Identifier: Apache-2.0

/**
 * 委托绕行：一条消息该走**非流式**端点，还是走 SSE。
 *
 * 为什么客户端要判这一下：服务端的**意图路由只存在于非流式端点**——`AiService.chat()`
 * 会做技能短路与意图分类并进入委托 / plan 分支，而 `chatStream()` 那条路径**整段没有意图路由**
 * （主仓实测：`chatStreamImpl` 起至文件尾，`intent` / `delegate` / `plan` / `matchSkill` 零命中，
 * 见 `Server-NestJS/test/agent-delegation-attribution.e2e-spec.ts` 的「§22.19 ① 多入口维度」一组用例）。
 * 故委托类消息若走 SSE，**永远不会被委托**，用户只会拿到一条普通回答。
 *
 * 判据与移动端 `Front-Flutter/.../ai_chat_provider.dart` 的 `_shouldDelegate` 逐字一致，
 * 使两端行为相同（此前只有移动端有这条绕行，控制台因此用不上子代理 / plan）。
 *
 * ⚠ **这是服务端规则的一份客户端副本**。服务端单源 = `Server-NestJS/src/ai/skills/skills-registry.ts`
 * 的 `WEEK_PLAN_SKILL.triggerKeywords`（本文件前 9 条与之逐字相同）。两处一旦不一致，控制台会
 * **静默**失去委托能力——不报错，只是不再委托。故本文件带一条**对账用例**
 * （`agentDelegation.spec.ts`）：服务端每加一个技能触发词，它就会红，逼着这里跟上。
 *
 * 后 12 条「delegate 意图词」是对 `RouterAgent` 那个**由 LLM 分类**的 delegate 意图的尽力镜像
 * ——它本就不精确（同一个词，模型可能给出别的意图）。命中它只意味着「试一下非流式」；而服务端
 * 非流式端点对普通问题照样正常作答，代价仅仅是失去打字机效果，不会答错。
 */
import { aiApi } from '@/api/ai'
import { adminApi } from '@/api/admin'

/** 命中即走非流式：技能触发词（前 9 条，与服务端单源对齐）+ delegate 意图词 */
const DELEGATE_TRIGGERS = [
  // week-plan 技能 —— 与服务端 `skills-registry.ts` 的 triggerKeywords 逐字相同
  '安排本周',
  '安排这周',
  '规划本周',
  '规划这周',
  '本周安排',
  '这周安排',
  '本周计划',
  '周计划',
  '周安排',
  // delegate 意图（LLM 分类的尽力镜像）
  '综合分析',
  '综合来看',
  '分别',
  '统筹',
  '全面分析',
  '盘点',
  '帮我规划',
  '做个规划',
  '汇总一下',
  '归纳',
]

/**
 * 动作词：写操作必须留在流式——确认卡是 `confirmation_request` 事件驱动的，
 * 而非流式端点对写工具直接返回「请用流式」，绕过去等于把功能打坏。
 */
const ACTION_VERBS = ['创建', '新增', '添加', '删除', '编辑', '修改', '取消']

/** 导航词：导航留在流式（与移动端同一排除项，保持两端一致） */
const NAV_VERBS = ['打开', '去', '跳转', '转到', '前往', '进入', '到']

/** 是否应绕到非流式端点（委托 / plan 只在那里可达）。动作或导航请求一律留在流式。 */
export function shouldDelegate(text: string): boolean {
  const t = text.trim()
  if (ACTION_VERBS.some((v) => t.includes(v))) return false
  if (NAV_VERBS.some((v) => t.includes(v))) return false
  return DELEGATE_TRIGGERS.some((k) => t.includes(k))
}

/** 委托调用的归一结果（两个非流式端点的响应字段本就相同，故在此归一，调用方只认这一种形状）。 */
export interface DelegationResult {
  reply: string
  conversationId: string
  navigateTo?: string
}

/**
 * 发起一次非流式委托调用：按角色选端点——管理员走系统助手 `/admin/ai/chat`，
 * 普通用户走本人数据作用域 `/ai/chat`。两个助手的入口共用它，免得同一段分支各写一遍。
 */
export async function sendDelegation(opts: {
  text: string
  isAdmin: boolean
  conversationId?: string
}): Promise<DelegationResult> {
  const body = { message: opts.text, conversationId: opts.conversationId }
  return opts.isAdmin ? adminApi.adminAiChat(body) : aiApi.chat(body)
}

/** 供对账用例读取，避免测试再抄一份清单。 */
export const delegateTriggersForParity = (): readonly string[] => DELEGATE_TRIGGERS
