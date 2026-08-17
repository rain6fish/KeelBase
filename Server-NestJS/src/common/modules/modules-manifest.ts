/**
 * 模块清单与依赖图谱（MOD-1）。
 *
 * 声明每个功能模块的：所属类别、必须同开的依赖、是否核心不可关。
 * 装配校验器 validateModuleGraph 校验「开 C 必须开 D、关 A 必须关 B」，
 * 防畸形配置。后续 MOD-2 启动期装配据此决定模块进不进 DI 图。
 *
 * 分组（对齐 roadmap §九 关键约束）：
 * - core：基础底座，不可关
 * - ai：AI 全家桶，必须同开同关
 * - notification：通知家族，必须同开同关
 * - business：可选业务样例，可独立关（events 依赖 notifications，因 reminder 通知）
 */

export type ModuleCategory = 'core' | 'ai' | 'notification' | 'business';

export interface ModuleManifestEntry {
  /** 模块标识 */
  id: string;
  /** 类别 */
  category: ModuleCategory;
  /** 必须同时启用的模块 */
  deps: string[];
  /** 核心不可关 */
  isCore?: boolean;
  /** 人类可读名（中文） */
  label: string;
}

export const CORE_MODULES = [
  'auth', 'users', 'health', 'metrics', 'casl', 'encryption',
  'cache', 'throttler', 'settings', 'feature-flags',
] as const;

/** AI 全家桶：同开同关 */
export const AI_MODULES = [
  'ai', 'knowledge', 'memory', 'embeddings', 'conversation',
  'sub-agent', 'confirmation', 'search', 'upload', 'knowledge-worker',
] as const;

/** 通知家族：同开同关 */
export const NOTIFICATION_MODULES = [
  'notifications', 'push', 'push-worker', 'reminder-worker', 'maintenance-tasks',
] as const;

/** 可选业务样例：可独立关 */
export const BUSINESS_MODULES = ['events', 'todos', 'posts', 'books', 'notes', 'tags', 'org', 'points', 'crm'] as const;

const coreEntries: ModuleManifestEntry[] = CORE_MODULES.map((id) => ({
  id,
  category: 'core' as const,
  deps: [],
  isCore: true,
  label: id,
}));

const aiEntries: ModuleManifestEntry[] = AI_MODULES.map((id) => ({
  id,
  category: 'ai' as const,
  deps: AI_MODULES.filter((x) => x !== id) as unknown as string[],
  label: id,
}));

const notificationEntries: ModuleManifestEntry[] = NOTIFICATION_MODULES.map((id) => ({
  id,
  category: 'notification' as const,
  deps: NOTIFICATION_MODULES.filter((x) => x !== id) as unknown as string[],
  label: id,
}));

const businessEntries: ModuleManifestEntry[] = [
  { id: 'events', category: 'business', deps: ['notifications'], label: '事件' },
  { id: 'todos', category: 'business', deps: [], label: '待办' },
  { id: 'tags', category: 'business', deps: [], label: '标签' },
  { id: 'notes', category: 'business', deps: [], label: '笔记' },
  { id: 'books', category: 'business', deps: [], label: '图书' },
  { id: 'posts', category: 'business', deps: [], label: '帖子' },
  { id: 'org', category: 'business', deps: ['notifications'], label: '组织架构' },
  { id: 'points', category: 'business', deps: [], label: '积分' },
  { id: 'crm', category: 'business', deps: [], label: '客户管理' },
];

export const MODULES_MANIFEST: ModuleManifestEntry[] = [
  ...coreEntries,
  ...aiEntries,
  ...notificationEntries,
  ...businessEntries,
];

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 校验给定启用模块集合是否符合依赖图谱。
 * - 核心模块必须启用
 * - 启用模块的 deps 必须同时启用
 */
export function validateModuleGraph(enabled: Set<string>): GraphValidationResult {
  const errors: string[] = [];

  for (const entry of MODULES_MANIFEST) {
    if (entry.isCore && !enabled.has(entry.id)) {
      errors.push(`核心模块 "${entry.id}" 必须启用`);
    }
    if (!enabled.has(entry.id)) continue;
    for (const dep of entry.deps) {
      if (!enabled.has(dep)) {
        errors.push(`启用 "${entry.id}" 必须同时启用 "${dep}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
