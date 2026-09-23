// SPDX-License-Identifier: Apache-2.0

/**
 * EASY-2 生成器：校验 + 命名变换 + 字段解析。
 * 零依赖，供 keelbase-init.mjs 与单测使用。
 */

export const RESERVED_FIELD_NAMES = new Set([
  'id', 'userId', 'createdAt', 'updatedAt', 'deletedAt',
]);

export const FIELD_TYPES = new Set([
  'string',
  'text',
  'int',
  'bool',
  'date',
  'enum',
  'decimal',
  'ref',
  'attachment',
]);

/** Names of the fields declared as attachments, in declaration order. */
export function attachmentFields(fields) {
  return (fields ?? []).filter((f) => f.type === 'attachment').map((f) => f.name);
}

/**
 * Every generated name an attachment association needs — the side-table entity,
 * its file, its table, the owning foreign key and the relation property.
 * Single-sourced because these names must agree across five files; a drift
 * between any two of them is a compile error, not a cosmetic difference.
 *
 * 附件关联所需的全部生成名 —— 侧表实体、文件名、表名、指向 owner 的外键、以及关系属性。
 * 单源，因为这些名字必须跨五个文件一致；任意两处漂移都是编译错误，而非措辞差异。
 */
export function attachmentArtifacts(ctx) {
  const ownerColumn = `${ctx.singular}Id`;
  return {
    className: `${ctx.singlePascal}Attachment`,
    fileName: `${ctx.singular}-attachment.entity.ts`,
    table: `${ctx.plural}_attachments`,
    ownerColumn,
    ownerColumnDb: toSnake(ownerColumn),
    relation: 'attachments',
  };
}

/** Cascade semantics a `ref` may declare; `restrict` (no cascade) is the default. */
const REF_DELETE_SEMANTICS = new Set(['restrict', 'setNull', 'cascade']);

/**
 * Column name carrying the foreign key for a `ref` field: `customer` → `customerId`
 * (stored as `customer_id`). Single-sourced so the entity, the DTO, the templates
 * and the tests cannot disagree about where the key lives.
 *
 * `ref` 字段承载外键的列名：`customer` → `customerId`（落库为 `customer_id`）。
 * 单源，使实体、DTO、模板与测试对「键在哪」的理解一致。
 */
export function refColumnName(fieldName) {
  return `${fieldName}Id`;
}

/** Resolved `ref` fields, carrying the FK column name. */
export function refFields(fields) {
  return (fields ?? [])
    .filter((f) => f.type === 'ref')
    .map((f) => ({ ...f, column: refColumnName(f.name) }));
}

/** Declared cascade semantics of a `ref` field, defaulting to `restrict`. */
export function refOnDelete(field) {
  return REF_DELETE_SEMANTICS.has(field?.onDelete) ? field.onDelete : 'restrict';
}

/**
 * The Dart model members a protocol field actually produces. For most types that is
 * the field itself; `ref` produces two (`<name>Id` and `<name>Name`) and `attachment`
 * one (`<name>Names`). Single-sourced so `copyWith` cannot reference a member the
 * declaration never made — that is a compile error, not a naming preference.
 *
 * 协议字段在 Dart 模型里**实际产出**的成员。多数类型就是字段本身；`ref` 产出两个
 * （`<name>Id` 与 `<name>Name`），`attachment` 产出一个（`<name>Names`）。单源，
 * 使 `copyWith` 不会引用声明里根本不存在的成员 —— 那是编译错误，不是命名偏好。
 */
export function modelMemberNames(field) {
  if (field.type === 'ref') return [refColumnName(field.name), `${field.name}Name`];
  if (field.type === 'attachment') return [`${field.name}Names`];
  return [field.name];
}

/**
 * Resolved target module of a `ref` — plural, singular and PascalCase — so the
 * templates build the entity import path and the class name from one place.
 *
 * `ref` 目标模块的解析结果 —— 复数、单数、PascalCase —— 使模板从单一处构造实体
 * 导入路径与类名。
 */
export function refTarget(target) {
  const singular = toSingular(target);
  return { plural: toPlural(target), singular, pascal: toPascal(singular) };
}

/** camelCase → snake_case：customerId → customer_id（与 TypeORM 既有列名一致）。 */
export function toSnake(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Validate a `ref` field: it must name a target module and a display field there,
 * and may declare cascade semantics. The three keys are rejected on every other
 * type so a spec cannot carry a setting the generator would silently ignore.
 *
 * 校验 `ref` 字段：必须给出目标模块与用于回显的字段，可声明级联语义。三个键在其它
 * 类型上一律拒绝 —— 否则 spec 会带着一个被生成器静默忽略的设置。
 *
 * 注：`target` 指向的模块是否存在、`display` 是否真在该模块上，属**跨 spec** 校验，
 * 不在本函数（它只看单个字段）。
 */
export function validateRefField(field) {
  for (const key of ['target', 'display', 'onDelete']) {
    if (field[key] !== undefined && field.type !== 'ref') {
      return `字段 ${field.name} 不是 ref，不应带 ${key}`;
    }
  }
  if (field.type !== 'ref') return null;
  if (typeof field.target !== 'string' || !/^[a-z][a-z0-9_]{0,29}$/.test(field.target)) {
    return `ref 字段 ${field.name} 须声明 target（目标模块的复数名，小写，如 customers）`;
  }
  if (typeof field.display !== 'string' || !/^[a-z][a-zA-Z0-9_]{0,29}$/.test(field.display)) {
    return `ref 字段 ${field.name} 须声明 display（目标模块上用于回显的字段名，如 name）`;
  }
  if (field.onDelete !== undefined && !REF_DELETE_SEMANTICS.has(field.onDelete)) {
    return `ref 字段 ${field.name} 的 onDelete 须为 restrict / setNull / cascade`;
  }
  return null;
}

/**
 * Integer digits of every decimal column, and the default fractional digits.
 * Fixed rather than configurable: one protocol key (`scale`) is enough, and
 * 18 integer digits covers business amounts with room to spare.
 *
 * 所有 decimal 列的整数位，以及缺省小数位。固定而不做成可配：协议里有一个
 * `scale` 键就够，18 位整数足以覆盖业务金额。
 */
export const DECIMAL_PRECISION = 18;
export const DECIMAL_DEFAULT_SCALE = 2;

/** 协议反推：旗舰应用高频的 enum 字段默认选项（CLI 字符串 `status:enum` 未给选项时）。 */
export const DEFAULT_ENUM_OPTIONS = ['active', 'inactive'];

/** 模块名：小写字母开头，字母/数字/下划线，最长 30。 */
export function validateModuleName(name) {
  if (!name) return '模块名不能为空';
  if (!/^[a-z][a-z0-9_]{0,29}$/.test(name)) {
    return '模块名必须是小写字母开头，仅含字母/数字/下划线（如 posts、user_profile）';
  }
  if (name.endsWith('s') && name.slice(0, -1).length < 3) {
    return `模块名 "${name}" 去掉末尾 s 后过短，请改用单数命名`;
  }
  return null;
}

/** 单数：post → post；posts → post。 */
export function toSingular(name) {
  return name.endsWith('s') && name.length > 3 ? name.slice(0, -1) : name;
}

/** 复数：post → posts；posts → posts。 */
export function toPlural(name) {
  const s = toSingular(name);
  return `${s}s`;
}

/** snake_case → PascalCase：user_profile → UserProfile。 */
export function toPascal(s) {
  return s
    .split('_')
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : ''))
    .join('');
}

/** snake_case → camelCase：user_profile → userProfile。 */
export function toCamel(s) {
  const p = toPascal(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

/** 中文标签：1-12 字符，仅中文/字母/数字/空格，防串内注入。 */
export function validateLabel(label) {
  if (!label || label.length < 1 || label.length > 12) return '标签需 1-12 个字符';
  if (/['"`\\\n\r]/.test(label)) return '标签不能包含引号/反斜杠/换行';
  if (!/^[一-龥a-zA-Z0-9 ]+$/.test(label)) {
    return '标签仅支持中文/字母/数字/空格';
  }
  return null;
}

/**
 * 解析 "title:string,content:text,status:enum" → [{name,type,enum?}]。
 * enum 支持内联选项 `status:enum:active,inactive`（小写英文/下划线，2-10 个）；未给选项时用默认。
 * 用正则逐字段匹配，避免 enum 选项里的逗号被当成字段分隔拆散。
 */
export function parseFields(str) {
  if (!str) return [];
  const fields = [];
  // 选项 token 用宽松 `[^,\s:]+`：非法选项（大写/中文等）保留进 enum 数组，由 validateFields 拒绝，而非静默丢弃
  const re = /([a-z][a-zA-Z0-9_]{0,29})(?::(enum(?::((?:[^,\s:]+)(?:,[^,\s:]+){1,9}))?|([a-z]+)))?/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    // 组 2 是 `enum(?::(...))?`（多选项时含选项串），用 startsWith 判定 enum 分支
    if (m[2] && m[2].startsWith('enum')) {
      const opts = m[3] ? m[3].split(',') : [];
      fields.push({ name: m[1], type: 'enum', enum: opts.length >= 2 ? opts : [...DEFAULT_ENUM_OPTIONS] });
    } else {
      fields.push({ name: m[1], type: m[4] || 'string' });
    }
  }
  return fields;
}

export function validateFields(fields) {
  const seen = new Set();
  for (const f of fields) {
    // 字段名允许 camelCase（代码库约定，TypeORM 自动映射 snake_case 列名）或 snake_case
    if (!/^[a-z][a-zA-Z0-9_]{0,29}$/.test(f.name)) return `字段名非法：${f.name}`;
    if (RESERVED_FIELD_NAMES.has(f.name)) return `字段名是保留词：${f.name}`;
    if (seen.has(f.name)) return `字段名重复：${f.name}`;
    seen.add(f.name);
    if (!FIELD_TYPES.has(f.type)) {
      return `字段类型非法：${f.name}:${f.type}（支持 string/text/int/bool/date/enum/decimal）`;
    }
    const decimalErr = validateDecimalField(f);
    if (decimalErr) return decimalErr;
    const piiErr = validatePiiField(f);
    if (piiErr) return piiErr;
    const refErr = validateRefField(f);
    if (refErr) return refErr;
    if (f.type === 'enum') {
      if (!Array.isArray(f.enum) || f.enum.length < 2 || f.enum.length > 10) {
        return `enum 字段 ${f.name} 需提供 2-10 个选项（协议 JSON 的 enum 数组）`;
      }
      for (const opt of f.enum) {
        if (typeof opt !== 'string' || !/^[a-z][a-z0-9_]{0,24}$/.test(opt)) {
          return `enum 选项非法：${f.name}.${opt}（需小写英文/下划线，如 active、in_progress）`;
        }
      }
      const labelErr = validateEnumLabels(f.name, f.enum, f.enumLabels);
      if (labelErr) return labelErr;
    }
  }
  return null;
}

/**
 * Validate the optional bilingual labels of an enum field.
 * Keys must be a subset of the enum options, otherwise the label list and the
 * option list drift apart and the rendered UI starts lying; every value must
 * carry both zh and en. Absent enumLabels is valid — generated code then falls
 * back to showing the identifier.
 *
 * enum 字段的可选双标签校验：键须 ⊆ enum 选项（否则标签与选项脱节、界面会说谎），
 * 每个值须同时带 zh 与 en。未声明 enumLabels 属合法 —— 生成物回落显示标识符。
 */
/** Characters that would break the emitted Dart / TS string literals — rejected at parse time. */
const ENUM_LABEL_BANNED = /['"`\\\n\r]|\$\{/;

export function validateEnumLabels(fieldName, options, labels) {
  if (labels === undefined) return null;
  if (labels === null || typeof labels !== 'object' || Array.isArray(labels)) {
    return `enumLabels 必须是对象：${fieldName}`;
  }
  for (const [key, value] of Object.entries(labels)) {
    if (!options.includes(key)) {
      return `enumLabels 的键不在 enum 选项中：${fieldName}.${key}`;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return `enumLabels 的值必须是 {zh,en} 对象：${fieldName}.${key}`;
    }
    for (const lang of ['zh', 'en']) {
      if (typeof value[lang] !== 'string' || value[lang].length === 0) {
        return `enumLabels 缺 ${lang} 标签：${fieldName}.${key}`;
      }
      if (ENUM_LABEL_BANNED.test(value[lang])) {
        return `enumLabels 的 ${lang} 标签含引号/反斜杠/换行/变量插值，会破坏生成代码：${fieldName}.${key}`;
      }
    }
  }
  return null;
}

/**
 * Whether an enum field declares usable labels. A single source so the schema,
 * the validator and the three templates agree on what "has labels" means.
 *
 * 该 enum 字段是否声明了可用标签。单源判定，使 schema、校验器与三端模板对
 * 「有标签」的理解一致。
 */
export function hasEnumLabels(field) {
  return Boolean(
    field?.enumLabels && typeof field.enumLabels === 'object' && Object.keys(field.enumLabels).length > 0,
  );
}

/**
 * Name of the generated i18n getter for one enum option. Single-sourced so the
 * Flutter template that reads the getter and the wire step that injects it
 * cannot drift apart into a Dart compile error.
 *
 * 某个 enum 选项所生成 i18n getter 的名字。单源定义，使「读 getter 的 Flutter 模板」
 * 与「注入 getter 的接线步骤」不会漂移成 Dart 编译错误。
 */
export function enumLabelGetter(ctx, fieldName, option) {
  return `${ctx.plural}${toPascal(fieldName)}${toPascal(option)}`;
}

/**
 * Fractional digits of a decimal field (defaults to 2). Single-sourced so the
 * schema, the validator and every template agree on one number.
 *
 * decimal 字段的小数位（缺省 2）。单源，使 schema、校验器与各模板对同一个数字
 * 的理解一致。
 */
export function decimalScale(field) {
  return Number.isInteger(field?.scale) ? field.scale : DECIMAL_DEFAULT_SCALE;
}

/**
 * Validate a field's decimal-only keys. `scale` bounds the fractional digits;
 * `currency` marks an amount whose symbol comes from the global setting. Both are
 * rejected on any other type — otherwise a spec would carry a setting that the
 * generator silently ignores, which is the same failure mode as a dropped key.
 *
 * 校验 decimal 专属键：`scale` 限定小数位，`currency` 标记金额（符号取全局设置）。
 * 两个键在其它类型上一律拒绝 —— 否则 spec 会带着一个被生成器静默忽略的设置，
 * 与「键被丢掉」是同一种失效。
 */
/**
 * Field types whose entity value is a string — the only ones a text mask can be
 * applied to. Masking is what makes a `pii` declaration mean something, so the
 * declaration is rejected everywhere else: a mask on a `Date` or `number` column
 * would emit a string into a typed property and the generated module would not
 * compile.
 *
 * 实体值是字符串的字段类型 —— 只有它们能施加文本掩码。掩码是 `pii` 声明之所以有意义
 * 的所在，故在其它类型上一律拒绝：对 `Date` 或 `number` 列掩码会往有类型的属性里塞
 * 字符串，生成的模块根本编译不过。
 */
const PII_TYPES = new Set(['string', 'text', 'enum', 'decimal']);

/**
 * Validate the optional `pii` marking. `pii: false` is allowed anywhere (it is an
 * explicit "not personal data"), `pii: true` only on string-typed fields.
 *
 * 校验可选的 `pii` 标记。`pii: false` 任意类型皆可（是显式的「非个人数据」），
 * `pii: true` 仅限字符串型字段。
 */
export function validatePiiField(field) {
  if (field.pii === undefined) return null;
  if (typeof field.pii !== 'boolean') return `字段 ${field.name} 的 pii 须为布尔`;
  if (!field.pii) return null;
  if (!PII_TYPES.has(field.type)) {
    return `字段 ${field.name} 声明了 pii，但掩码产出字符串，只能声明在 string/text/enum/decimal 上`;
  }
  return null;
}

/**
 * Names of the fields declared as personal data, in declaration order.
 * Single-sourced so the admin mask, the audit key registration and the tests
 * cannot disagree about which fields are PII.
 *
 * 被声明为个人数据的字段名，按声明顺序。单源，使管理端掩码、审计键注册与测试
 * 对「哪些字段是 PII」的理解一致。
 */
export function piiFieldNames(fields) {
  return (fields ?? []).filter((f) => f.pii === true).map((f) => f.name);
}

export function validateDecimalField(field) {
  for (const key of ['scale', 'currency']) {
    if (field[key] !== undefined && field.type !== 'decimal') {
      return `字段 ${field.name} 不是 decimal，不应带 ${key}`;
    }
  }
  if (field.scale !== undefined && !Number.isInteger(field.scale)) {
    return `decimal 字段 ${field.name} 的 scale 须为整数`;
  }
  if (typeof field.scale === 'number' && (field.scale < 0 || field.scale > 6)) {
    return `decimal 字段 ${field.name} 的 scale 须在 0-6 之间`;
  }
  if (field.currency !== undefined && typeof field.currency !== 'boolean') {
    return `decimal 字段 ${field.name} 的 currency 须为布尔`;
  }
  return null;
}

/**
 * 协议 JSON spec.fields → 结构化字段：保留 name/type/enum，并透传 required（required:true=必填；
 * 缺省/required:false=可选）。此前丢弃 required 会让 string/enum 误按必填生成（#3 陌生人实测卡点）。
 *
 * enumLabels is carried through unchanged when present, so the generated front
 * ends can render human labels instead of raw identifiers. Dropping it here
 * would silently strip the labels before any template ever sees them.
 *
 * 存在 enumLabels 时原样透传，供生成的三端渲染人类标签而非裸标识符。
 * 在此丢弃会让标签在到达任何模板之前就被静默剥掉。
 */
export function normalizeSpecFields(fields) {
  return (fields ?? []).map((f) => ({
    name: f.name,
    type: f.type || 'string',
    ...(Array.isArray(f.enum) && f.enum.length > 0 ? { enum: f.enum } : {}),
    ...(f.enumLabels && typeof f.enumLabels === 'object' && !Array.isArray(f.enumLabels)
      ? { enumLabels: f.enumLabels }
      : {}),
    // decimal-only keys must survive normalisation for the same reason enumLabels
    // must: dropped here, they never reach a template and the loss is silent.
    // decimal 专属键必须与 enumLabels 同理活着穿过归一化：在此丢掉就永远到不了模板，且无声。
    ...(Number.isInteger(f.scale) ? { scale: f.scale } : {}),
    ...(typeof f.currency === 'boolean' ? { currency: f.currency } : {}),
    // pii 同理必须活着穿过归一化：在此丢掉，管理端就不会掩码，而调用方无从察觉。
    // pii must survive normalisation for the same reason: dropped here, the admin
    // list stops masking and nothing tells the caller.
    ...(typeof f.pii === 'boolean' ? { pii: f.pii } : {}),
    // ref 的三键同理必须活着穿过归一化（丢掉 = 关联静默退化成普通列）。
    // The three ref keys must survive for the same reason: dropped, the relation
    // silently degrades into a plain column.
    ...(typeof f.target === 'string' ? { target: f.target } : {}),
    ...(typeof f.display === 'string' ? { display: f.display } : {}),
    ...(typeof f.onDelete === 'string' ? { onDelete: f.onDelete } : {}),
    ...(typeof f.required === 'boolean' ? { required: f.required } : {}),
  }));
}

/**
 * Protocol 2.0 aiTools 声明校验（可选；缺省 = 生成默认 query R1 + create R3 确认，兼容旧协议）。
 * 形态：{ enabled?: boolean, query?: false | { riskLevel?: 'R0'-'R5', requiresConfirmation?: boolean },
 *        create?: false | { riskLevel?: 'R0'-'R5', requiresConfirmation?: boolean } }
 */
export function validateAiTools(aiTools) {
  if (aiTools == null) return null;
  if (typeof aiTools !== 'object' || Array.isArray(aiTools)) return 'aiTools 必须是对象';
  if (aiTools.enabled !== undefined && typeof aiTools.enabled !== 'boolean') return 'aiTools.enabled 必须是布尔';
  for (const key of ['query', 'create']) {
    const v = aiTools[key];
    if (v === undefined || v === true) continue;
    if (v === false) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      if (v.riskLevel !== undefined && !/^R[0-5]$/.test(v.riskLevel)) return `aiTools.${key}.riskLevel 必须是 R0-R5`;
      if (v.requiresConfirmation !== undefined && typeof v.requiresConfirmation !== 'boolean') return `aiTools.${key}.requiresConfirmation 必须是布尔`;
      if (v.requiresConfirmation === false && (!v.riskLevel || !['R1', 'R2'].includes(v.riskLevel))) {
        return `aiTools.${key}: requiresConfirmation=false 需显式配 R1/R2 风险级`;
      }
      continue;
    }
    return `aiTools.${key} 必须是 false 或 { riskLevel, requiresConfirmation }`;
  }
  return null;
}

/** 工具开关（单一来源，templates-ai 与 wire 共用）：enabled 关全部；query/create false 关单个；缺省开。 */
export function aiToolsFlags(aiTools) {
  const enabled = aiTools?.enabled !== false;
  return {
    query: enabled && aiTools?.query !== false,
    create: enabled && aiTools?.create !== false,
  };
}

/**
 * 归一化为生成上下文：{ singular, plural, singlePascal, pluralPascal, camel, label, fields }
 */
export function buildContext(name, label, fields) {
  const singular = toSingular(name);
  return {
    singular,
    plural: toPlural(name),
    singlePascal: toPascal(singular),
    pluralPascal: toPascal(toPlural(name)),
    camel: toCamel(singular),
    label,
    fields,
  };
}
