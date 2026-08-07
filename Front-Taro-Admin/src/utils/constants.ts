export const APP_NAME = 'Admin Console'
export const API_BASE_URL = 'http://localhost:3000/api/v1'
export const API_TIMEOUT = 30000

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'admin_access_token',
  REFRESH_TOKEN: 'admin_refresh_token',
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
