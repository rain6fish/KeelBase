/**
 * AI 流式对话客户端（SSE）：POST /ai/chat/stream，逐事件回调；D1 CRM 闭环的确认卡数据通道。
 * 与后端 ai.controller chatStream 事件契约对齐：text / tool_start / confirmation_request /
 * confirmation_decision / tool_end / done / error（SSE 格式 `event: <type>\ndata: <json>\n\n`）。
 */
import { API_BASE_URL } from '@/utils/constants'
import { storage } from '@/utils/storage'
import { api } from '@/api/client'

// ── 流式事件类型（与后端 ai.service.ts chatStream 对齐）──────────────────────

export interface AiAuthCheck {
  name: string
  ok: boolean
  note?: string
}

/** W5-⑦ Explainable Authz：为何允许 / 为何需确认（人类语言 + 技术检查清单） */
export interface AiAuthorization {
  granted?: boolean
  role?: string
  riskLevel?: string
  checks?: AiAuthCheck[]
  [key: string]: unknown
}

export interface AiToolStart {
  name: string
  summary?: string
  arguments: Record<string, unknown>
  isWrite: boolean
  riskLevel?: string
  authorization?: AiAuthorization
}

export interface AiConfirmation {
  token: string
  toolName: string
  summary?: string
  arguments?: Record<string, unknown>
  mode?: 'confirmation' | 'approval'
  authorization?: AiAuthorization
}

export interface AiConfirmationDecision {
  toolName: string
  approved: boolean
  success?: boolean
  resultId?: number
  error?: string
}

export interface AiToolEnd {
  name: string
  success: boolean
  summary?: string
  error?: string
}

export type StreamChatEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_start'; toolStart: AiToolStart }
  | { type: 'confirmation_request'; confirmation: AiConfirmation }
  | { type: 'confirmation_decision'; confirmationDecision: AiConfirmationDecision }
  | { type: 'tool_end'; toolEnd: AiToolEnd }
  | { type: 'done'; conversationId: string }
  | { type: 'error'; error?: string }

export interface StreamChatOptions {
  message: string
  conversationId?: string
  signal?: AbortSignal
  onEvent: (event: StreamChatEvent) => void
  onEnd?: () => void
  onError?: (err: Error) => void
}

/** 刷新 access token（轻量版；对齐 client.ts 语义：HTTP 200 + data.accessToken/refreshToken） */
async function refreshAccessToken(): Promise<boolean> {
  const { refreshToken } = storage.readTokens()
  if (!refreshToken) return false
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    const body = (await res.json().catch(() => null)) as {
      data?: { accessToken?: string; refreshToken?: string }
    } | null
    if (body?.data?.accessToken && body.data.refreshToken) {
      storage.saveTokens(body.data.accessToken, body.data.refreshToken)
      return true
    }
  } catch {
    // 刷新失败（网络/过期）→ 返回 false，上层抛错
  }
  return false
}

function postStream(
  tokens: { accessToken: string },
  payload: { message: string; conversationId?: string },
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${API_BASE_URL}/ai/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(tokens.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  })
}

/** 解析单个 SSE 块：取 data: 行合并后 JSON.parse 为事件；忽略 event: 行（data 内自带 type） */
function handleBlock(block: string, onEvent: (event: StreamChatEvent) => void): void {
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
  }
  if (!dataLines.length) return
  try {
    onEvent(JSON.parse(dataLines.join('\n')) as StreamChatEvent)
  } catch {
    // 忽略无法解析的块（注释行 / 心跳等）
  }
}

/** 发起流式对话：读完整 SSE，逐事件回调；AbortError 静默返回（关抽屉中止） */
export async function streamChat(options: StreamChatOptions): Promise<void> {
  let tokens = storage.readTokens()
  let res = await postStream(tokens, { message: options.message, conversationId: options.conversationId }, options.signal)
  if (res.status === 401 && (await refreshAccessToken())) {
    tokens = storage.readTokens()
    res = await postStream(tokens, { message: options.message, conversationId: options.conversationId }, options.signal)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    options.onError?.(new Error(text || `Request failed with status ${res.status}`))
    return
  }

  try {
    const reader = res.body?.getReader()
    if (!reader) {
      options.onError?.(new Error('No response body'))
      return
    }
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // 兼容 CRLF：统一成 \n 后再按空行切块
      buffer = buffer.replace(/\r\n/g, '\n')
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        handleBlock(block, options.onEvent)
      }
    }
    options.onEnd?.()
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    options.onError?.(err as Error)
  }
}

/** 确认 AI 写操作：approve 后服务器继续执行并推流（confirmation_decision / tool_end） */
export async function confirmTool(token: string, decision: 'approve' | 'reject', trustTool?: boolean): Promise<void> {
  await api.post(`/ai/confirmations/${encodeURIComponent(token)}`, { decision, trustTool })
}
