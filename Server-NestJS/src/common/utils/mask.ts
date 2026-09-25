// SPDX-License-Identifier: Apache-2.0

/**
 * 管理端数据脱敏工具。
 * 原则：管理页面不出现用户填写的个人数据/隐私数据；必须出现时用掩码遮盖。
 * 掩码在服务端完成，前端与管理端 API 调用方均拿不到明文。
 */

/** 邮箱掩码：只掩码 @ 前缀，@ 后的域名保留。alice@example.com → a***@example.com */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}

/** 手机号掩码：13800138000 → 138****8000 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '***';
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

/** 通用掩码：超过一半长度用 *，用于姓氏/名等短字段 */
export function maskText(value: string): string {
  if (value.length <= 1) return '*';
  const keep = Math.ceil(value.length / 3);
  return `${value.slice(0, keep)}${'*'.repeat(value.length - keep)}`;
}

/** 敏感字段名（大小写不敏感匹配）——审计 requestBody 打码用 */
const SENSITIVE_KEYS = [
  'password',
  'oldpassword',
  'newpassword',
  'refreshToken',
  'accessToken',
  'token',
  'secret',
  'apikey',
  'apiKey',
  'authorization',
  // CR-4：个人隐私字段（审计 requestBody 打码）
  'email',
  'phone',
  'bio',
  'firstName',
  'lastName',
  'dateOfBirth',
  'birthday',
  'address',
  'avatarUrl',
  'providerId',
  'providerHash',
];

/**
 * Extra key names declared by modules — e.g. a generated module's `idCardNo`,
 * which the built-in list cannot know about. Additive by design: the built-in
 * names keep working and callers only ever add, so a module cannot weaken
 * redaction for names the platform already knows.
 *
 * 模块声明的额外键名 —— 如生成模块的 `idCardNo`，内建清单不可能知道它。
 * 刻意做成增量：内建名一如既往，调用方只做添加 —— 因此模块无法削弱平台已知名的打码。
 */
const EXTRA_SENSITIVE_KEYS = new Set<string>();

/**
 * Let a module declare additional sensitive key names so that audit redaction
 * covers field names the built-in list cannot know. Generated module code calls
 * this when the protocol declares `pii` fields.
 *
 * 允许模块声明额外的敏感键名，使审计打码覆盖内建清单不可能知道的字段名。
 * 协议声明了 `pii` 字段时，由生成的模块代码调用。
 */
export function registerSensitiveKeys(keys: readonly string[]): void {
  for (const key of keys) {
    if (typeof key === 'string' && key.length > 0) EXTRA_SENSITIVE_KEYS.add(key);
  }
}

/**
 * Fragments that make a name sensitive wherever they appear in it. The built-in list names fields
 * one by one, but some names cannot be enumerated in advance — a module's `apiToken`, the user
 * table's `resetTokenHash` — and a name carrying one of these fragments is sensitive no matter what
 * surrounds it.
 *
 * `passwd`, `salt` and `api[_-]?key` came from the AI side-effect snapshot's own fragment set when it
 * was folded into this predicate (2026-09-25). They are kept because dropping them would have
 * **narrowed** that surface: the snapshot caught names like `passwd` and `api_key` that the built-in
 * list never enumerated.
 *
 * 名字中出现即视为敏感的片段。内建清单逐个点名，但有些名字无法预先枚举 —— 模块的 `apiToken`、
 * 用户表的 `resetTokenHash` —— 命中这些片段的名字无论前后缀为何都算敏感。
 *
 * `passwd`、`salt`、`api[_-]?key` 来自 AI 副作用快照自己那套片段 —— 2026-09-25 把它并入本判据时保留
 * 下来：丢掉就会**收窄**那一面，因为快照原先能命中 `passwd`、`api_key` 这类内建清单从未枚举的名字。
 */
const SENSITIVE_KEY_FRAGMENTS = /password|passwd|token|secret|refresh|salt|api[_-]?key/i;

/**
 * Whether a field name is one the platform treats as sensitive: a built-in name, a name a module
 * registered, or a name carrying one of the fragments above.
 *
 * Exported so the audit before-snapshot uses **this** rule rather than keeping one of its own. The
 * snapshot used to carry a local `password|token|secret|refresh` regex while the request body was
 * redacted from `SENSITIVE_KEYS`; the two had drifted, and that drift is why an email reached the
 * before-snapshot in clear text while the same email was masked in the body. This predicate is the
 * union of both rules, so the snapshot keeps every name the local regex caught and gains the PII
 * names it missed.
 *
 * 某字段名是否被平台视为敏感：内建名、模块注册的名，或带上列片段的名。导出使审计的 before 快照用
 * **这一条**判据，而非自留一份。快照原带一条本地 `password|token|secret|refresh` 正则，requestBody
 * 则走 `SENSITIVE_KEYS` 打码；两者已经漂移，漂移正是「同一个邮箱在 body 里被打码、却明文进了 before
 * 快照」的原因。本判据是两条规则的并集 —— 快照既保留本地正则原先命中的全部名字，又补上它漏掉的
 * PII 名字。
 */
export function isSensitiveKey(key: string): boolean {
  if (SENSITIVE_KEY_FRAGMENTS.test(key)) return true;
  const lower = key.toLowerCase();
  return (
    SENSITIVE_KEYS.some((k) => k.toLowerCase() === lower) ||
    Array.from(EXTRA_SENSITIVE_KEYS).some((k) => k.toLowerCase() === lower)
  );
}

/**
 * Redact every sensitive value in a JSON string, driven by the same `isSensitiveKey` predicate the
 * audit before-snapshot uses — one rule, one place.
 *
 * The walk visits every key at every level, so a name the built-in list cannot enumerate (a module's
 * `apiToken`, the user table's `resetTokenHash`) is covered by the fragment half of the predicate.
 * Redaction keys off **field names**, never off the text of the JSON: a note that happens to contain
 * the characters `"password":"…"` is a note, and stays one. A value under a sensitive name is masked
 * whatever its type — a numeric token is no less a token.
 *
 * Invalid input is returned unchanged.
 *
 * 对 JSON 字符串中的敏感值打码，判据与审计 before 快照共用同一条 `isSensitiveKey` —— 一条规则、一处。
 *
 * 逐层走每个键，因此内建清单枚举不到的名字（模块的 `apiToken`、用户表的 `resetTokenHash`）由判据的
 * 片段那一半覆盖。打码只认**字段名**，绝不认 JSON 的文本：一段正文里恰好含有 `"password":"…"` 这些
 * 字符，它仍是正文。敏感名下的值不分类型一律打码 —— 数字形式的 token 同样是 token。
 *
 * 非法输入原样返回。
 */
export function redactSensitive(json: string): string {
  try {
    return JSON.stringify(redactValue(JSON.parse(json)));
  } catch {
    return json;
  }
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? '***' : redactValue(v);
    }
    return out;
  }
  return value;
}
