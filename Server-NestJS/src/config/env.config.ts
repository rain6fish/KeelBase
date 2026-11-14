// SPDX-License-Identifier: Apache-2.0

import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  CORS_ORIGINS: Joi.string().default('*'),

  // JWT
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  /** AI Bridge 委托 token 密钥（Java 系统共享验签；缺省回退 JWT_SECRET，生产应显式配置独立密钥） */
  DELEGATION_SECRET: Joi.string().min(32).optional().allow(''),

  // Database (遵循文档规范)
  DB_TYPE: Joi.string().valid('sqlite', 'postgres').default('sqlite'),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_NAME: Joi.string().default('front'),
  DB_USER: Joi.string().default('postgres'),
  DB_PASSWORD: Joi.string().default('postgres'),
  DB_PATH: Joi.string().default('./data/front.sqlite'),

  // 治理独立库（D2-2 独立治理控制平面）：治理台服务独立库，schema 从治理实体生成；不配置时回落主库配置
  GOVERNANCE_DB_HOST: Joi.string().optional().allow(''),
  GOVERNANCE_DB_PORT: Joi.number().optional(),
  GOVERNANCE_DB_NAME: Joi.string().optional().allow(''),
  GOVERNANCE_DB_USER: Joi.string().optional().allow(''),
  GOVERNANCE_DB_PASSWORD: Joi.string().optional().allow(''),
  GOVERNANCE_DB_PATH: Joi.string().optional().allow(''),
  // D2-3 治理台接入密钥（业务系统上报/拉策略共享；空则治理台 external 端点 401）
  GOVERNANCE_API_KEY: Joi.string().optional().allow(''),
  // D2-3b 治理台地址（业务系统配置后审计双写上报；空则完全本地）
  GOVERNANCE_URL: Joi.string().optional().allow(''),
  // D2-4 治理台回调业务系统地址（治理台撤销副作用时回调业务系统撤销端点；空则治理台本地 revoker）
  GOVERNANCE_TARGET_URL: Joi.string().optional().allow(''),

  // REV-2：`compensating`（已请求外部补偿·结果未知）超过多少分钟算「陈旧」。
  // 只用于**标出**「挂了多久 / 可能已陈旧」，真值仍在目标系统，不据此改写成功或失败。
  REVOKE_STALE_MINUTES: Joi.number().integer().min(1).default(60),

  // F-79：陈旧写占位的**有界自动重问** —— 每小时清扫最多自动对账几次（默认 4）、每次之前等多久
  // （默认 60,360,1440,4320，即 +1h/+6h/+24h/+72h）。次数按查询证据行计（人工对账也计入），档位数是次数上限。
  // Bounded automatic re-asking of a stuck write claim: how many hourly-sweep reconciles at most, and
  // the wait before each. Attempts count recorded lookup rows (manual ones included); the table length
  // caps the count.
  CLAIM_RECONCILE_MAX_ATTEMPTS: Joi.number().integer().min(1).default(4),
  CLAIM_RECONCILE_BACKOFF_MINUTES: Joi.string().default('60,360,1440,4320'),
  // 每趟（每小时）最多发出多少个询问（默认 25），跨所有占位行合计：次数上限界的是「一条行一辈子问几次」，
  // 这一条界的是「一趟里同时打出去多少请求」。没轮到的行仍然到期，下一趟按最老的先问。
  // How many queries one hourly pass may send (default 25), across all claims — a burst bound, not a
  // per-row one. Rows left over stay due and are served next hour, oldest first.
  CLAIM_RECONCILE_MAX_PER_PASS: Joi.number().integer().min(1).default(25),

  // 连接池（文档规范，初期保守配置）
  DB_POOL_MAX: Joi.number().default(20),
  DB_POOL_MIN: Joi.number().default(5),
  DB_POOL_IDLE_TIMEOUT: Joi.number().default(30000),
  DB_POOL_CONNECTION_TIMEOUT: Joi.number().default(2000),

  // 可观测性
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent').default('info'),
  OTEL_ENABLED: Joi.string().valid('true', 'false').default('false'),
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().allow('').default(''),
  LOKI_ENABLED: Joi.string().valid('true', 'false').default('false'),
  LOKI_URL: Joi.string().uri().allow('').default('http://localhost:3100'),

  // 安全设置
  LOCKOUT_THRESHOLD: Joi.number().default(10),
  LOCKOUT_DURATION: Joi.number().default(15),
  // 全局限流（3.4 压测/大促可放宽；默认 60 次/分钟）
  THROTTLE_LIMIT: Joi.number().min(1).default(60),
  THROTTLE_TTL: Joi.number().min(1000).default(60000),

  // 敏感数据静态加密（AES-256-GCM）
  ENCRYPTION_KEY: Joi.string().length(64).required(),       // 32 bytes hex
  ENCRYPTION_HMAC_KEY: Joi.string().length(64).allow('').default(''),
  // HS-11 审计链独立密钥（W4-②）：AUDIT_HMAC_KEY 与业务加密密钥分离；AUDIT_HMAC_KEY_PREVIOUS 为轮换时旧密钥（保留用于验证旧记录）
  AUDIT_HMAC_KEY: Joi.string().length(64).allow('').default(''),
  AUDIT_HMAC_KEY_PREVIOUS: Joi.string().length(64).allow('').default(''),
  // AW-12 记录级复核：谁负责读审计记录、多久读一次。两者都配置了才算「已指派」；空 ⇒ 覆盖声明报
  // `record-review-unassigned`（unknown）。配置了 owner 时，只有该用户名的账号能签复核回执。
  // AW-12 record-level review: who owns reading the audit records, and how often. Both must be set to
  // count as assigned; empty ⇒ the coverage statement reports `record-review-unassigned` (unknown).
  // When `owner` is set, only the account with that username may sign a review receipt.
  AUDIT_REVIEW_OWNER: Joi.string().max(64).allow('').default(''),
  AUDIT_REVIEW_CADENCE_DAYS: Joi.number().integer().min(1).allow('').default(''),

  // OAuth 第三方登录
  OAUTH_ENABLED_PROVIDERS: Joi.string().allow('').default('wechat,alipay,qq'),
  OAUTH_REDIRECT_BASE: Joi.string().uri().allow('').default(''),
  GOOGLE_CLIENT_ID: Joi.string().allow('').default(''),
  APPLE_CLIENT_ID: Joi.string().allow('').default(''),

  // P2-4 企业 SSO（通用 OIDC）：配齐 OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET 后，/auth/oauth/providers 出现 oidc（enterprise 组）
  OIDC_ENABLED: Joi.boolean().default(false),
  OIDC_ISSUER: Joi.string().uri().allow('').default(''),
  OIDC_CLIENT_ID: Joi.string().allow('').default(''),
  OIDC_CLIENT_SECRET: Joi.string().allow('').default(''),

  // OAuth 中国区第三方
  WECHAT_APP_ID: Joi.string().allow('').default(''),
  WECHAT_APP_SECRET: Joi.string().allow('').default(''),
  // MINI-2 微信订阅消息：事件提醒模板 ID（小程序后台申请；空则不发送）
  WECHAT_REMIND_TEMPLATE_ID: Joi.string().allow('').default(''),
  ALIPAY_APP_ID: Joi.string().allow('').default(''),
  ALIPAY_PUBLIC_KEY: Joi.string().allow('').default(''),
  ALIPAY_PRIVATE_KEY: Joi.string().allow('').default(''),
  QQ_APP_ID: Joi.string().allow('').default(''),
  QQ_APP_KEY: Joi.string().allow('').default(''),

  // AI Provider 配置
  AI_PROVIDER: Joi.string().valid('deepseek', 'qwen', 'openai', 'anthropic', 'gemini', 'ollama').default('deepseek'),
  AI_CHAT_MODEL: Joi.string().default('deepseek-v4-flash'),
  AI_MAX_TOKENS: Joi.number().default(4096),
  AI_TEMPERATURE: Joi.number().min(0).max(2).default(0.7),
  CONVERSATION_TTL: Joi.number().default(3600),

  // DeepSeek
  DEEPSEEK_API_KEY: Joi.string().allow('').default(''),
  DEEPSEEK_BASE_URL: Joi.string().default('https://api.deepseek.com'),

  // Qwen（阿里百炼）
  QWEN_API_KEY: Joi.string().allow('').default(''),
  QWEN_BASE_URL: Joi.string().default('https://dashscope.aliyuncs.com/compatible-mode/v1'),

  // OpenAI（预留）
  OPENAI_API_KEY: Joi.string().allow('').default(''),
  OPENAI_BASE_URL: Joi.string().default('https://api.openai.com/v1'),

  // Anthropic Claude（官方 OpenAI 兼容层，tool calling 支持）
  ANTHROPIC_API_KEY: Joi.string().allow('').default(''),
  ANTHROPIC_BASE_URL: Joi.string().default('https://api.anthropic.com/v1'),

  // Google Gemini（官方 OpenAI 兼容层 /v1beta/openai，tool calling 支持）
  GEMINI_API_KEY: Joi.string().allow('').default(''),
  GEMINI_BASE_URL: Joi.string().default('https://generativelanguage.googleapis.com/v1beta/openai'),

  // RAG 向量检索（AI-5）
  VECTOR_SEARCH_ENABLED: Joi.boolean().default(true),
  EMBEDDING_BASE_URL: Joi.string().allow('').default(''),
  EMBEDDING_API_KEY: Joi.string().allow('').default(''),
  EMBEDDING_MODEL: Joi.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSIONS: Joi.number().default(1536),

  // 邮件服务（SMTP）
  MAIL_ENABLED: Joi.boolean().default(false),
  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().default(465),
  SMTP_SECURE: Joi.boolean().default(true),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASS: Joi.string().allow('').default(''),
  SMTP_FROM: Joi.string().allow('').default(''),
  APP_BASE_URL: Joi.string().default('http://localhost:8080'),

  // 备份保留份数（npm run backup 轮转用）
  BACKUP_KEEP: Joi.number().default(7),

  // 特性开关（PL-8/EASY-3）：FEATURE_<KEY>_ENABLED；不设默认，未配置由 APP_PRESET 判定（默认 full 全开）
  FEATURE_AI_ENABLED: Joi.boolean(),
  FEATURE_SEARCH_ENABLED: Joi.boolean(),
  FEATURE_PUSH_ENABLED: Joi.boolean(),
  FEATURE_SMS_ENABLED: Joi.boolean(),
  FEATURE_OAUTH_ENABLED: Joi.boolean(),
  FEATURE_UPLOAD_ENABLED: Joi.boolean(),
  FEATURE_NOTIFICATIONS_ENABLED: Joi.boolean(),
  FEATURE_TODOS_ENABLED: Joi.boolean(),
  // 生成模块/旗舰/组织功能 flag（对齐 feature-flags.constants FEATURE_KEYS；否则未声明 flag 无 Joi 布尔强转，=1/=yes 行为不一）
  FEATURE_CONTRACTS_ENABLED: Joi.boolean(),
  FEATURE_SUPPLIERS_ENABLED: Joi.boolean(),
  FEATURE_TAGS_ENABLED: Joi.boolean(),
  FEATURE_NOTES_ENABLED: Joi.boolean(),
  FEATURE_BOOKS_ENABLED: Joi.boolean(),
  FEATURE_POSTS_ENABLED: Joi.boolean(),
  FEATURE_ORG_ENABLED: Joi.boolean(),
  FEATURE_POINTS_ENABLED: Joi.boolean(),
  FEATURE_CRM_ENABLED: Joi.boolean(),
  FEATURE_PM_ENABLED: Joi.boolean(),
  FEATURE_APPROVAL_ENABLED: Joi.boolean(),

  // CR-21 上传访问控制：=1 时强制校验签名 URL（渐进模式默认放行裸 URL）
  UPLOAD_REQUIRE_SIGN: Joi.boolean().truthy('1').default(false),

  // EASY-3 三档预设：full（默认全开）| small（关外部集成）| lite（最小可用）
  APP_PRESET: Joi.string().valid('full', 'small', 'lite').default('full'),

  // 定时任务（PL-7）：已读通知保留天数，超期清理
  NOTIFICATION_RETENTION_DAYS: Joi.number().default(30),

  // Headless API（AI-19）：第三方集成用 API Key
  HEADLESS_API_KEY: Joi.string().allow('').default(''),

  // 联网搜索（AI-14）
  TAVILY_API_KEY: Joi.string().allow('').default(''),
  TAVILY_BASE_URL: Joi.string().allow('').default('https://api.tavily.com/search'),

  // 私有化 AI（POV-1）：本地 Ollama，数据不出域
  OLLAMA_BASE_URL: Joi.string().allow('').default(''),
  OLLAMA_MODEL: Joi.string().default('qwen2.5:7b'),
  OLLAMA_EMBED_MODEL: Joi.string().default('bge-m3'),

  // 异常告警 Webhook（RG-4）
  ALERT_WEBHOOK_ENABLED: Joi.boolean().default(false),
  ALERT_WEBHOOK_URL: Joi.string().allow('').default(''),
  ALERT_WEBHOOK_TYPE: Joi.string().valid('dingtalk', 'feishu', 'slack').default('dingtalk'),
  ALERT_WEBHOOK_MIN_INTERVAL_SECONDS: Joi.number().min(1).default(60),

  // Redis 缓存
  REDIS_URL: Joi.string().allow('').default('redis://localhost:6379'),
  CACHE_ENABLED: Joi.boolean().default(true),
  CACHE_TTL: Joi.number().default(300),

  // 异步队列（BullMQ）——队列**必须**有 Redis，故默认关闭：零配置启动不去连不存在的 Redis
  //（曾默认 true，导致未起 Redis 时 BullMQ 持续重连、每秒若干条 ECONNREFUSED 栈，2026-09-22 实测）。
  // 有 Redis 的部署请显式设 QUEUE_ENABLED=true（docker-compose.yml 已设）；关闭时降级同步执行。
  QUEUE_ENABLED: Joi.boolean().default(false),

  // 短信服务
  SMS_DRIVER: Joi.string().valid('console', 'aliyun', 'none').default('console'),

  // 推送通知
  PUSH_DRIVER: Joi.string().valid('none', 'jpush').default('none'),
  JPUSH_APP_KEY: Joi.string().allow('').default(''),
  JPUSH_MASTER_SECRET: Joi.string().allow('').default(''),

  // 对象存储
  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
  S3_ENDPOINT: Joi.string().allow('').default(''),
  S3_REGION: Joi.string().allow('').default('us-east-1'),
  S3_BUCKET: Joi.string().allow('').default(''),
  S3_ACCESS_KEY: Joi.string().allow('').default(''),
  S3_SECRET_KEY: Joi.string().allow('').default(''),
  S3_PUBLIC_URL: Joi.string().allow('').default(''),
  S3_SIGNED_URL_TTL: Joi.number().integer().positive().default(3600),
});

/**
 * Secrets that have been published: the values baked into `Dockerfile.single`'s ENV, and the ones a
 * reader copies out of the `.env.*.example` templates. They are no longer secret — anyone can sign a
 * token or decrypt rows with them — so a production process refuses to boot on one.
 * 这些密钥已经公开：`Dockerfile.single` 的 ENV 默认值，以及 `.env.*.example` 模板里可直接拷走的值。
 * 它们不再保密 —— 任何人都能拿它签 token 或解密存量数据 —— 所以生产进程读到它们就拒绝启动。
 */
const PUBLICLY_KNOWN_SECRETS: ReadonlyMap<string, string> = new Map([
  ['keelbase-single-container-dev-secret-at-least-32-chars!!', 'JWT_SECRET in Dockerfile.single'],
  ['keelbase-single-container-refresh-secret-32chars!!', 'JWT_REFRESH_SECRET in Dockerfile.single'],
  [
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'ENCRYPTION_KEY in Dockerfile.single / .env.example',
  ],
  [
    '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
    'ENCRYPTION_HMAC_KEY in Dockerfile.single',
  ],
  ['change-me-jwt-secret-at-least-32-characters!!', 'JWT_SECRET in .env.example'],
  ['change-me-refresh-secret-at-least-32-chars!!', 'JWT_REFRESH_SECRET in .env.example'],
  ['change-me-production-jwt-secret-min-32-chars!!', 'JWT_SECRET in .env.production.example'],
  ['change-me-production-refresh-secret!!-32', 'JWT_REFRESH_SECRET in .env.production.example'],
  ['change-me-staging-jwt-secret-min-32-chars!!', 'JWT_SECRET in .env.staging.example'],
  ['change-me-staging-refresh-secret-min-32!!', 'JWT_REFRESH_SECRET in .env.staging.example'],
]);

/** Variables whose value is a key, not a setting: rotated, never defaulted. 这些变量是密钥，只能轮换，不能给默认值。 */
const SECRET_KEYS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ENCRYPTION_KEY',
  'ENCRYPTION_HMAC_KEY',
  'AUDIT_HMAC_KEY',
  'DELEGATION_SECRET',
] as const;

const GENERATE_HINT = [
  'Generate real secrets and pass them in:',
  '  export JWT_SECRET=$(openssl rand -hex 32)',
  '  export JWT_REFRESH_SECRET=$(openssl rand -hex 32)',
  '  export ENCRYPTION_KEY=$(openssl rand -hex 32)',
  '  docker run -e JWT_SECRET -e JWT_REFRESH_SECRET -e ENCRYPTION_KEY ...   # or: ./scripts/docker-single.sh up',
  '  # compose: write them into Server-NestJS/.env.production (template: .env.production.example)',
  '',
  '生成真实密钥后注入（上面三条命令即可；docker 用 -e / --env-file，compose 写进 .env.production）。',
].join('\n');

/**
 * Startup gate: validates the merged environment and stops the process before it can serve a request
 * with missing, malformed, or already-published secrets. There is deliberately no fallback value —
 * a silent default is how a signing key ends up inside a published image.
 * 启动闸：校验合并后的环境；密钥缺失、格式不对、或用的是已公开的值时，进程在对外服务之前停下。
 * 这里**刻意不提供兜底值** —— 静默默认正是签名密钥混进已发布镜像的方式。
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const { error, value } = envValidationSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
  });
  if (error) {
    const details = error.details.map((d) => `  - ${d.path.join('.')}: ${d.message}`).join('\n');
    throw new Error(
      [
        'Environment validation failed — KeelBase refuses to start, and will not substitute a default secret.',
        details,
        '',
        GENERATE_HINT,
        '',
        '环境变量校验失败 —— 缺密钥或格式不对时 KeelBase 拒绝启动，也不会用内置默认值顶替。',
        '原因见上面的条目；按上面的三条命令生成真实密钥后注入即可。',
      ].join('\n'),
    );
  }

  if (value.NODE_ENV === 'production') {
    const published = SECRET_KEYS.filter((key) => {
      const v = value[key];
      return typeof v === 'string' && v !== '' && PUBLICLY_KNOWN_SECRETS.has(v);
    }).map((key) => `  - ${key} = ${PUBLICLY_KNOWN_SECRETS.get(value[key] as string)}`);
    if (published.length > 0) {
      throw new Error(
        [
          'Refusing to start: production is configured with a publicly known secret.',
          ...published,
          'These values shipped inside published artifacts, so they are not secret anymore.',
          'Replace each with a fresh value (openssl rand -hex 32). Changing ENCRYPTION_KEY also makes rows',
          'encrypted with the old key unreadable — plan that rotation deliberately.',
          '',
          '生产环境拒绝启动：当前配置用的是已公开的密钥（下面的值曾随镜像或模板发布，已不再保密）。',
          '请逐个用 openssl rand -hex 32 生成新值替换。更换 ENCRYPTION_KEY 后，用它加密过的存量数据将无法解密，',
          '轮换需要单独安排。',
        ].join('\n'),
      );
    }
  }

  return value;
}
