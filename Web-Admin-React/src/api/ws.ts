import { storage } from '@/utils/storage'
import { API_BASE_URL } from '@/utils/constants'

/** WS 信封（对齐后端 docs/ws-realtime.spec.md）：{ event, data } */
export interface WsMessage {
  event: string
  data?: unknown
}

let socket: WebSocket | null = null
const listeners = new Set<(msg: WsMessage) => void>()
let retryMs = 1000
let closed = false
let pingTimer: ReturnType<typeof setInterval> | null = null

function wsBase(): string {
  const base = API_BASE_URL.replace(/\/api\/v1$/, '')
  const origin = base.startsWith('/') ? window.location.origin : base
  return `${origin.replace(/^http/, 'ws')}/ws`
}

/** 连接实时通道（幂等；内部含心跳 + 指数退避重连） */
export function connectRealtime() {
  if (socket || closed) return
  const token = storage.readTokens().accessToken
  const ws = new WebSocket(`${wsBase()}?token=${encodeURIComponent(token)}`)
  socket = ws
  ws.onopen = () => {
    retryMs = 1000
    startPing()
  }
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string) as WsMessage
      listeners.forEach((cb) => cb(msg))
    } catch {
      // 忽略非 JSON 帧
    }
  }
  ws.onerror = () => scheduleReconnect()
  ws.onclose = () => scheduleReconnect()
}

export function onRealtimeMessage(cb: (msg: WsMessage) => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function sendRealtime(event: string, data?: unknown) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ event, data }))
  }
}

function startPing() {
  stopPing()
  pingTimer = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event: 'ping', data: null }))
    }
  }, 20000)
}

function stopPing() {
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
}

function scheduleReconnect() {
  stopPing()
  socket?.close()
  socket = null
  if (closed) return
  setTimeout(() => connectRealtime(), retryMs)
  retryMs = Math.min(retryMs * 2, 30000)
}

export function closeRealtime() {
  closed = true
  stopPing()
  socket?.close()
  socket = null
  listeners.clear()
}
