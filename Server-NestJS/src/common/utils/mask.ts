// SPDX-License-Identifier: Apache-2.0

/**
 * 管理端数据脱敏工具。
 * 原则：管理页面不出现用户填写的个人数据/隐私数据；必须出现时用掩码遮盖。
 * 掩码在服务端完成，前端与管理端 API 调用方均拿不到明文。
 */

/** 邮箱掩码：只掩码 @ 前缀，@ 后的域名保留。alice@example.com → a***@example.com */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return REDACTED;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}

/** 手机号掩码：13800138000 → 138****8000 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return REDACTED;
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

/** 通用掩码：超过一半长度用 *，用于姓氏/名等短字段 */
export function maskText(value: string): string {
  if (value.length <= 1) return REDACTED;
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
export function isSensitiveKey(key: string, extra: ReadonlySet<string> = NO_EXTRA_KEYS): boolean {
  if (SENSITIVE_KEY_FRAGMENTS.test(key)) return true;
  const lower = key.toLowerCase();
  return (
    extra.has(lower) ||
    SENSITIVE_KEYS.some((k) => k.toLowerCase() === lower) ||
    Array.from(EXTRA_SENSITIVE_KEYS).some((k) => k.toLowerCase() === lower)
  );
}

/**
 * The one spelling for "this value is not shown to you". Request bodies, audit `changes` and AI
 * side-effect snapshots all use it — and so do the mask helpers above when they have nothing left to
 * reveal: an email with no `@` masks to this rather than to a run of asterisks.
 *
 * The `*` characters in `maskEmail` / `maskPhone` / `maskText` mean something else: they only ever
 * appear **inside** a value whose remaining characters are still visible (`al***@example.com`).
 * Asterisks build a partial mask around what is kept; this constant stands for revealing nothing.
 *
 * 「这个值不给你看」的唯一写法。requestBody、审计 `changes`、AI 副作用快照都用它 —— 上面那几个掩码
 * 函数在**没有东西可留**时也用它：没有 `@` 的邮箱掩码成它，而不是一串星号。
 *
 * `maskEmail` / `maskPhone` / `maskText` 里的 `*` 是**另一回事**：它们只出现在**仍有可见字符**的值
 * 内部（`al***@example.com`）。星号是在保留下来的字符周围拼出的部分掩码；本常量代表什么都不留。
 */
export const REDACTED = '[REDACTED]';

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
 * 对 JSON 字符串中的敏感值打码，判据与审计 before 快照共用同一条 `isSensitiveKey` —— 一条规则、一处。
 *
 * 逐层走每个键，因此内建清单枚举不到的名字（模块的 `apiToken`、用户表的 `resetTokenHash`）由判据的
 * 片段那一半覆盖。打码只认**字段名**，绝不认 JSON 的文本：一段正文里恰好含有 `"password":"…"` 这些
 * 字符，它仍是正文。敏感名下的值不分类型一律打码 —— 数字形式的 token 同样是 token。
 *
 * Input that is not JSON is **not** returned as-is. A string-level sanitizer runs before this
 * function on the retention path, and it rewrites unquoted tokens (`"phone":13800138000` becomes
 * `"phone":138****8000`), which makes the text unparseable. Returning it unchanged would leave every
 * *other* sensitive field — a password in the same body — in clear text, and nothing would say so.
 * The fallback therefore walks the raw text and masks the value of any key the shared predicate calls
 * sensitive, scalar values only. Where it cannot vouch for completeness — an unterminated string, or
 * a sensitive key whose value is a nested object/array — it withholds the entire document
 * (`UNREDACTABLE`) instead of guessing. So a rewriter-limited input loses evidence, not a secret.
 *
 * 非 JSON 输入**不**再原样返回。留存路径上先跑字符串级消毒器，它会改写未加引号的 token
 * （`"phone":13800138000` 变成 `"phone":138****8000`），文本因此失去可解析性。原样返回会让同一份正文
 * 里**其它**敏感字段（如 password）保持明文，且无人察觉。故兜底改为在原始文本上按共用判据逐键扫描，
 * 只打码标量值。凡是无法担保完整的形状 —— 字符串未闭合、敏感名下的值是嵌套对象/数组 —— 一律整篇
 * 置为 `UNREDACTABLE`，不猜。也就是说，消毒器改写不了的输入丢的是证据，不是秘密。
 */
export function redactSensitive(json: string, extraKeys: readonly string[] = []): string {
  const extra = lowerKeySet(extraKeys);
  try {
    return JSON.stringify(redactValue(JSON.parse(json), extra));
  } catch {
    return redactUnparseable(json, extra) ?? UNREDACTABLE;
  }
}

/**
 * The one output for input that is neither JSON nor safely scannable: the whole document is
 * withheld, because a partial textual pass cannot prove it covered every sensitive field. Distinct
 * from `REDACTED`, which stands for one masked value; this one says "no part of this payload is
 * shown". A caller that sees it must not treat the document as retained evidence.
 *
 * 「既不是 JSON、也无法安全扫描」的唯一输出：整篇隐去 —— 文本级部分打码无法证明覆盖了每个敏感字段。
 * 与 `REDACTED` 不同：后者代表一个被打码的值，本常量代表「这份载荷没有任何部分可见」。调用方见到它，
 * 不得把该文档当作已留存的证据。
 */
export const UNREDACTABLE = '[REDACTED: unparseable payload]';

/**
 * Text-level fallback for unparseable input. Returns the redacted text, or `null` when completeness
 * cannot be vouched for.
 *
 * Every position is examined: a `"` opens a string literal, a closed `'…'` pair followed by `:` or
 * `=` is a single-quoted key, and an identifier run is a bare word. If the token is followed by `:`
 * or `=`, it is a key under this contract; when the shared predicate calls it sensitive, its value
 * is masked — a double-quoted scalar keeps its quotes, bare scalars (single-quoted ones included)
 * are replaced outright. A sensitive key whose value cannot be delimited (a nested `{`/`[`, or a
 * string that never closes) returns `null`, which the caller turns into `UNREDACTABLE`.
 *
 * 不可解析输入的文本级兜底。返回打码后的文本；无法担保完整时返回 `null`。
 *
 * 每个位置都会被检查：`"` 开启字符串字面量，成对闭合且后接 `:` 或 `=` 的 `'…'` 是单引号键，标识符
 * 连跑是一个裸词。若该 token 后面跟着 `:` 或 `=`，按本约定它就是键；共用判据判为敏感时打码它的值 ——
 * 双引号标量保留引号，裸标量（含单引号标量）整体替换。敏感键的值无法定界（嵌套 `{`/`[`，或永不
 * 闭合的字符串）则返回 `null`，由调用方转为 `UNREDACTABLE`。
 */
function redactUnparseable(input: string, extra: ReadonlySet<string>): string | null {
  const n = input.length;
  let out = '';
  let copied = 0;
  let i = 0;
  while (i < n) {
    const ch = input[i];
    // `"` opens a string literal unconditionally. Arbitrary text is not JSON, so a lone apostrophe
    // in prose (`It's fine`, `don't retry`) must not: treating it as a delimiter makes the scanner
    // run to the next apostrophe or withhold the whole document.
    //
    // A `'` is a delimiter only as a **closed pair followed by `:` or `=`** — the shape of a
    // single-quoted key (`{'password': 'x'}`, Python reprs, single-quoted object dumps). Anything
    // else advances one character, so the text after an apostrophe is still walked. A single-quoted
    // *value* needs no delimiter of its own: it is masked as a bare value either way.
    //
    // `"` 无条件开启字符串字面量。任意文本不是 JSON，故散文里的孤立撇号（`It's fine`、`don't retry`）
    // 不能当定界符 —— 否则扫描会跑到下一个撇号或整篇隐去。
    //
    // `'` 只有在**成对闭合且其后紧跟 `:` 或 `=`** 时才是定界符 —— 即单引号键的形状（`{'password': 'x'}`、
    // Python repr、单引号对象转储）。其余情况只前进一个字符，撇号后面的文本照常被扫描。单引号的**值**
    // 不需要自己的定界符：它无论如何都按裸值掩掉。
    if (ch === "'") {
      const end = stringEnd(input, i);
      if (end > 0 && isKeyPosition(input, end + 1) && isSensitiveKey(input.slice(i + 1, end), extra)) {
        const value = readScalar(input, valueStart(input, end + 1));
        if (!value) return null;
        out += input.slice(copied, value.start) + value.text;
        copied = value.end;
        i = value.end;
        continue;
      }
      i++;
      continue;
    }
    if (ch === '"') {
      const end = stringEnd(input, i);
      if (end < 0) return null;
      if (isKeyPosition(input, end + 1)) {
        if (isSensitiveKey(input.slice(i + 1, end), extra)) {
          const value = readScalar(input, valueStart(input, end + 1));
          if (!value) return null;
          out += input.slice(copied, value.start) + value.text;
          copied = value.end;
          i = value.end;
          continue;
        }
      }
      i = end + 1;
      continue;
    }
    if (isIdentStart(ch)) {
      let end = i + 1;
      while (end < n && isIdentPart(input[end])) end++;
      if (isKeyPosition(input, end)) {
        if (isSensitiveKey(input.slice(i, end), extra)) {
          const value = readScalar(input, valueStart(input, end));
          if (!value) return null;
          out += input.slice(copied, value.start) + value.text;
          copied = value.end;
          i = value.end;
          continue;
        }
      }
      i = end;
      continue;
    }
    i++;
  }
  return out + input.slice(copied);
}

/** Whether the token ending at `from` (a key candidate) is followed by `:` or `=`. */
function isKeyPosition(input: string, from: number): boolean {
  const at = skipSpace(input, from);
  return at < input.length && (input[at] === ':' || input[at] === '=');
}

/** Where the value begins: past the separator following a key candidate. */
function valueStart(input: string, from: number): number {
  const separator = skipSpace(input, from);
  return separator < input.length ? skipSpace(input, separator + 1) : separator;
}

/** Index of the string literal's closing quote, or -1 when it never closes. */
function stringEnd(input: string, from: number): number {
  const quote = input[from];
  for (let i = from + 1; i < input.length; i++) {
    if (input[i] === '\\') {
      i++;
      continue;
    }
    if (input[i] === quote) return i;
  }
  return -1;
}

function skipSpace(input: string, from: number): number {
  let i = from;
  while (i < input.length && /\s/.test(input[i])) i++;
  return i;
}

function isIdentStart(ch: string): boolean {
  return ch === '_' || ch === '$' || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

/** Identifier characters, plus `.`/`-` so dotted paths (`user.password`) stay one name. */
function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || ch === '.' || ch === '-' || (ch >= '0' && ch <= '9');
}

/**
 * Read the value at `from`, returning where it ends and what replaces it. `null` means the value is
 * there but cannot be delimited textually (a nested structure or an unclosed string) — the caller
 * must withhold the document rather than leave it unmasked.
 */
function readScalar(
  input: string,
  from: number,
): { start: number; end: number; text: string } | null {
  if (from >= input.length) return { start: from, end: from, text: '' };
  const ch = input[from];
  if (ch === '"') {
    const end = stringEnd(input, from);
    return end < 0 ? null : { start: from, end: end + 1, text: `"${REDACTED}"` };
  }
  if (ch === '{' || ch === '[') return null;
  if (ch === '\n' || ch === '\r') return { start: from, end: from, text: '' };
  return readBareValue(input, from);
}

/**
 * Read a bare (unquoted) value. It ends at a line break, a structural close, or a separator that
 * begins the next key/value pair.
 *
 * A comma, `&` or `;` **inside** the value is not a terminator: `password=correct,horse` has no key
 * after the comma, so the whole phrase is masked; `password=x&title=y` stops before `&title=`, so
 * the next field survives. Whitespace alone never ends it. Before this rule, stopping at every
 * separator left the tail of a passphrase containing one of those characters in clear.
 *
 * 读取裸值（未加引号）。终止于换行、结构闭合符，或「下一个键值对」开始的分隔符。
 *
 * 值**内部**的逗号、`&`、`;` 不是终止符：`password=correct,horse` 的逗号后面没有键，于是整句都被
 * 掩掉；`password=x&title=y` 在 `&title=` 前停下，下一个字段得以保留。空白本身永不终止。改此规则前，
 * 在每个分隔符处停下会让含这些字符的口令后半截留在明文。
 */
function readBareValue(
  input: string,
  from: number,
): { start: number; end: number; text: string } {
  let end = from;
  while (end < input.length) {
    const ch = input[end];
    if (ch === '\n' || ch === '\r' || ch === '}' || ch === ']') break;
    if ((ch === ',' || ch === '&' || ch === ';') && startsKeyValue(input, end + 1)) break;
    end++;
  }
  return { start: from, end, text: REDACTED };
}

/** Whether the text at `from` (after optional spaces) begins `key:` or `key=`. */
function startsKeyValue(input: string, from: number): boolean {
  const at = skipSpace(input, from);
  if (at >= input.length) return false;
  const ch = input[at];
  if (ch === '"' || ch === "'") {
    const end = stringEnd(input, at);
    return end > at && isKeyPosition(input, end + 1);
  }
  if (isIdentStart(ch)) {
    let end = at + 1;
    while (end < input.length && isIdentPart(input[end])) end++;
    return isKeyPosition(input, end);
  }
  return false;
}

const NO_EXTRA_KEYS: ReadonlySet<string> = new Set();

/**
 * 把一个**声明来的**字段名清单规范成可查的小写集合 —— `isSensitiveKey` 的比较一向下标不敏感。
 * 空清单复用同一个空集合，故「没有额外声明」的调用点不因此多一次分配。
 *
 * Normalize a declared field-name list into a lowercase set; `isSensitiveKey` compares
 * case-insensitively. An empty list reuses one shared empty set, so callers with nothing to declare
 * pay no allocation. The declared names are what a *resource* says about itself — a customer's
 * `name` / `company` — and they are deliberately not merged into the global list: `name` is a key on
 * fifteen entities, and masking it everywhere would blank out contracts, projects and departments too.
 */
export function lowerKeySet(keys: readonly string[]): ReadonlySet<string> {
  return keys.length > 0 ? new Set(keys.map((k) => k.toLowerCase())) : NO_EXTRA_KEYS;
}

function redactValue(value: unknown, extra: ReadonlySet<string> = NO_EXTRA_KEYS): unknown {
  if (Array.isArray(value)) return value.map((v) => redactValue(v, extra));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k, extra) ? REDACTED : redactValue(v, extra);
    }
    return out;
  }
  return value;
}
