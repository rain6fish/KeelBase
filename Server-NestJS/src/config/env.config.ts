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

  // 异步队列（BullMQ）
  QUEUE_ENABLED: Joi.boolean().default(true),

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
});
