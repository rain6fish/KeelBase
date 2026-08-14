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
  TODOS: 'todos',  POSTS: 'posts',

} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export const FEATURE_KEY_METADATA = 'feature_flags:key';
