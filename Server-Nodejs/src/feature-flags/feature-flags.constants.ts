/**
 * 特性开关（Feature Flags）key 集合。
 *
 * 每个 key 对应环境变量 `FEATURE_<KEY>_ENABLED`（默认 true，显式 false 关闭）。
 * 与 RG-2 动态配置互补：PL-8 管"功能开合"（静态、随 env 启动），RG-2 管"运营参数值"（动态、随 DB 生效）。
 */
export const FEATURE_KEYS = {
  AI: 'ai',
  SEARCH: 'search',
  PUSH: 'push',
  SMS: 'sms',
  OAUTH: 'oauth',
  UPLOAD: 'upload',
  NOTIFICATIONS: 'notifications',
  TODOS: 'todos',
  TAGS: 'tags',
  NOTES: 'notes',
  BOOKS: 'books',
  POSTS: 'posts',

} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export const FEATURE_KEY_METADATA = 'feature_flags:key';

/**
 * EASY-3 三档预设：定义各档「默认关闭」的模块。
 * full（默认）= 全开；small/lite 通过关闭清单实现「开箱即精简」。
 * 显式 `FEATURE_<KEY>_ENABLED` env 优先于预设（用户可覆盖）。
 */
export type AppPreset = 'full' | 'small' | 'lite';

export const PRESETS: Record<AppPreset, FeatureKey[]> = {
  // 全功能：不关闭任何模块（默认）
  full: [],
  // small：单容器开箱，关闭需外部凭据/配置的集成（推送/短信/OAuth）
  small: ['push', 'sms', 'oauth'],
  // lite：在 small 基础上再关搜索与生成的重业务模块，最小可用
  lite: ['push', 'sms', 'oauth', 'search', 'tags', 'notes', 'books', 'posts'],
};
