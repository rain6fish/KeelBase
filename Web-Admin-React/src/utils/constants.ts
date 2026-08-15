export const APP_NAME = 'KeelBase Admin'

// API 基址：开发走相对 /api/v1（Vite proxy → localhost:3000）；跨域部署用 VITE_API_BASE 覆盖。
export const API_BASE_URL = import.meta.env.VITE_API_BASE || '/api/v1'

export const API_TIMEOUT = 30000

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'admin_access_token',
  REFRESH_TOKEN: 'admin_refresh_token',
  LOCALE: 'admin_locale',
  THEME: 'admin_theme',
} as const

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

/** 可观测性系统入口（Grafana / Prometheus / Jaeger / Loki），部署时按环境调整 */
export const OBSERVABILITY_URLS = {
  grafana: 'http://localhost:3001',
  prometheus: 'http://localhost:9090',
  jaeger: 'http://localhost:16686',
  loki: 'http://localhost:3100',
} as const
