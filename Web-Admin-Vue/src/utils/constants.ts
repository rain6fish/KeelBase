export const APP_NAME = 'KeelBase Admin'

// API 基址：开发走相对 /api/v1（Vite proxy → localhost:3000）；跨域部署用 VITE_API_BASE 覆盖。
// 相对路径保证同域 nginx 反代 + 单容器 SERVE_STATIC 都可用（避免旧版硬编码 localhost 的 DEP-5 问题）。
export const API_BASE_URL = import.meta.env.VITE_API_BASE || '/api/v1'

// 治理台基址（D2-5c）：独立治理控制平面地址，如 http://localhost:3100/api/v1
// 未配置 VITE_GOVERNANCE_URL 时回落主应用（治理端点仍走主应用，行为不变）
export const GOVERNANCE_BASE_URL = import.meta.env.VITE_GOVERNANCE_URL || API_BASE_URL

export const API_TIMEOUT = 30000

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'admin_access_token',
  REFRESH_TOKEN: 'admin_refresh_token',
  LOCALE: 'admin_locale',
  THEME: 'admin_theme',
  THEME_VARIANT: 'admin_theme_variant',
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
