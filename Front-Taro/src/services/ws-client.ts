import Taro from '@tarojs/taro'
import { storage } from '../utils/storage'
import { API_BASE_URL } from '../utils/constants'

/** WS 信封（对齐后端 docs/ws-realtime.spec.md）：{ event, data } */
export interface WsMessage {
  event: string
  data?: any
}

/**
 * WebSocket 双向通道客户端（RG-6，/ws?token=）。
 * 基于 Taro.connectSocket（H5/小程序通用）；心跳 ping 20s + 指数退避重连（1s→30s）。
 */
class WsClient {
  private task: Taro.SocketTask | null = null
  private listeners = new Set<(msg: WsMessage) => void>()
  private retryMs = 1000
  private closed = false
  private pingTimer: ReturnType<typeof setInterval> | null = null

  connect() {
    if (this.task || this.closed) return
    const token = storage.readTokens().accessToken
    const base = this.resolveBase()
    const url = `${base}/ws?token=${encodeURIComponent(token)}`
    const task = Taro.connectSocket({ url })
    this.task = task
    task.onOpen(() => {
      this.retryMs = 1000
      this.startPing(task)
    })
    task.onMessage((res) => {
      try {
        const msg = JSON.parse(res.data as string) as WsMessage
        this.listeners.forEach((cb) => cb(msg))
      } catch {
        // 忽略非 JSON 帧
      }
    })
    task.onError(() => this.scheduleReconnect())
    task.onClose(() => this.scheduleReconnect())
  }

  onMessage(cb: (msg: WsMessage) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  send(event: string, data?: any) {
    this.task?.send({ data: JSON.stringify({ event, data }) })
  }

  close() {
    this.closed = true
    this.stopPing()
    this.task?.close({ code: 1000 })
    this.task = null
    this.listeners.clear()
  }

  private resolveBase(): string {
    let base = API_BASE_URL.replace(/\/api\/v1$/, '')
    if (base.startsWith('/')) {
      // H5 同源相对路径 → 用 location origin
      base =
        typeof window !== 'undefined' && window.location
          ? window.location.origin
          : ''
    }
    return base.replace(/^http/, 'ws')
  }

  private startPing(task: Taro.SocketTask) {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      try {
        task.send({ data: JSON.stringify({ event: 'ping', data: null }) })
      } catch {
        // 忽略
      }
    }, 20000)
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private scheduleReconnect() {
    this.stopPing()
    this.task = null
    if (this.closed) return
    setTimeout(() => this.connect(), this.retryMs)
    this.retryMs = Math.min(this.retryMs * 2, 30000)
  }
}

export const wsClient = new WsClient()
