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

/**
 * The field types a module may declare as its searchable columns.
 *
 * `string` and `text` only. `enum` is a text column at the database level, but it is **not** a
 * searchable one here: a module declares which of its own fields the global search may match, and a
 * status/category is an enumeration, not free text. Leaving `enum` out also keeps the generation-time
 * refusal honest — under declared columns, a spec whose only text-ish field is an `enum` really has
 * nothing to search, so refusing it is correct rather than over-strict.
 *
 * 模块可声明为「可搜列」的字段类型。
 *
 * 只 `string` 与 `text`。`enum` 在数据库层是文本列，但在这里**不是**可搜列：模块声明的是「它自己的
 * 哪些字段允许被全局搜索匹配」，而状态/类别是枚举、不是自由文本。把 `enum` 排除在外也让生成期的拒绝
 * 保持诚实 —— 在「列由声明来」的语义下，一个只有 `enum` 字段的 spec **确实**没有可搜的东西，
 * 拒绝它是对的，不是过严。
 */
export const SEARCHABLE_FIELD_TYPES = new Set(['string', 'text']);

/**
 * The columns a module's search may match: its spec's `string` / `text` fields, in declaration order.
 *
 * One rule, three consumers — the manifest's `searchableModules`, the generation-time refusal of a
 * `searchable` spec with nothing to match, and the generated list endpoint's `?q=`. Keeping them on
 * one function is the point: a module whose list searches a different set of columns than its
 * manifest advertises would be two answers to the same question.
 *
 * 模块的搜索可匹配哪些列：spec 里的 `string` / `text` 字段，按声明顺序。
 *
 * 一条规则、三个消费方 —— 清单的 `searchableModules`、生成期对「声明了 `searchable` 却没有可匹配
 * 列」的拒绝、以及生成物列表端点的 `?q=`。收在一个函数里正是要点：若一个模块的列表搜的列与它清单
 * 里公布的列不是同一组，同一个问题就有了两个答案。
 */
export function searchableFieldNames(fields) {
  return (fields ?? []).filter((f) => SEARCHABLE_FIELD_TYPES.has(f.type)).map((f) => f.name);
}

/**
 * The l10n getter a generated field's placeholder reads, from the module's plural and the field name:
 * `books` + `author` → `booksAuthor`.
 *
 * One function because two places must agree on it — the page that reads the getter and the
 * dictionary that declares it. When they disagree the generated page does not compile, which is the
 * failure this name exists to make impossible.
 *
 * 生成字段的占位符要读的那个 l10n getter，由模块复数名与字段名算出：`books` + `author` → `booksAuthor`。
 *
 * 收成一个函数，是因为有两处必须对同一个名字达成一致 —— 读它的页面与声明它的字典。两处不一致时，
 * 生成的页面**编译不过**；这个名字存在的意义就是让那件事不可能发生。
 */
export function fieldLabelGetter(plural, fieldName) {
  // `Field` in the middle is not decoration: `<plural><Field>` alone would collide with the page
  // getters the same generator emits — a module with a `title` field would want `notesTitle` twice,
  // and the dictionary would end up with two getters of that name. The infix keeps them apart.
  // 中间那个 `Field` 不是装饰：只用 `<复数><字段>` 会与同一生成器发出的页面 getter 撞名 —— 一个带
  // `title` 字段的模块会要两次 `notesTitle`，字典里就出现两个同名 getter。这个中缀把它们分开。
  const pascal = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
  return `${plural}Field${pascal}`;
}

/**
 * The scope levels a module may declare.
 *
 * `owner` is deliberately absent: every generated module is already owner-scoped by its fixed security
 * wiring, so declaring it would be declaring what is always true. What a spec can ask for is the rows
 * *beyond* its own — same organisation, and the department column that role-configured levels need.
 *
 * 模块可声明的范围级别。
 *
 * `owner` 刻意不在其中：每个生成模块在**固定安全接线**里已经是 owner 范围，声明它等于声明一件恒真的事。
 * spec 能要的是**超出本人**的那些行 —— 同组织，以及「按角色配置的部门级范围」所需要的部门列。
 */
export const SCOPE_LEVELS = new Set(['org', 'dept']);

/**
 * Validate a spec's `scope` declaration. Returns an error message, or `null` when it is fine.
 *
 * `dept` without `org` is refused rather than silently promoted: department levels are reached through
 * the org column at runtime (`buildScopeWhere` returns owner-only the moment the org is missing), so a
 * module that declared only `dept` would get a column that can never do anything — a declaration with
 * nothing behind it, which is exactly what the `searchable` rule refuses too.
 *
 * 校验 spec 的 `scope` 声明。返回错误消息，合规时返回 `null`。
 *
 * `dept` 不带 `org` 一律拒绝、而不是悄悄补齐：部门级在运行时是**经组织列**抵达的（组织信息一缺，
 * `buildScopeWhere` 就退回仅本人），故只声明 `dept` 的模块会拿到一个永远起不了作用的列 —— 一条背后
 * 什么都没有的声明，而那正是 `searchable` 那条规则也拒绝的东西。
 */
export function validateScope(scope) {
  if (scope === undefined) return null;
  if (!Array.isArray(scope) || scope.length === 0) return 'scope 须是非空数组，取值 org / dept';
  const unknown = scope.filter((s) => !SCOPE_LEVELS.has(s));
  if (unknown.length) return `scope 含未知级别：${unknown.join(', ')}（只支持 org / dept）`;
  if (new Set(scope).size !== scope.length) return `scope 含重复级别：${scope.join(', ')}`;
  if (scope.includes('dept') && !scope.includes('org')) {
    return 'scope 声明了 dept 就必须同时声明 org —— 部门级范围以组织为前提，缺组织信息只会退回本人';
  }
  return null;
}

/** Normalise a scope declaration to a fixed order (`org` then `dept`), so output is deterministic. */
/* 把 scope 声明归一成固定顺序（org 在前、dept 在后），使产出确定。 */
export function normalizeScope(scope) {
  const list = Array.isArray(scope) ? scope : [];
  return ['org', 'dept'].filter((level) => list.includes(level));
}

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
 * one (`<name>Attachments`, a list of id+name refs — a bare name cannot revoke).
 * Single-sourced so `copyWith` cannot reference a member the declaration never made —
 * that is a compile error, not a naming preference.
 *
 * 协议字段在 Dart 模型里**实际产出**的成员。多数类型就是字段本身；`ref` 产出两个
 * （`<name>Id` 与 `<name>Name`），`attachment` 产出一个（`<name>Attachments`，id+名字
 * 的引用列表 —— 只有名字撤销不了）。单源，使 `copyWith` 不会引用声明里根本不存在的
 * 成员 —— 那是编译错误，不是命名偏好。
 */
export function modelMemberNames(field) {
  if (field.type === 'ref') return [refColumnName(field.name), `${field.name}Name`];
  if (field.type === 'attachment') return [`${field.name}Attachments`];
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

/**
 * Irregular plurals that actually show up as table names and resource names.
 *
 * Both directions come from this one table on purpose: `toPlural` is built on `toSingular`, so fixing
 * only the singular would turn `entries` into `entrys`. And it is a table rather than a rule on purpose
 * too — English pluralisation is not regular, and `movies` and `entries` end the same way and resolve
 * oppositely, so any general rule is wrong on one of them. Words outside the table keep the plain `-s`
 * behaviour they have always had: no guessing.
 *
 * 作为**表名 / 资源名**真会出现的不规则复数。两向都出自这一张表，这是刻意的：`toPlural` 是在 `toSingular`
 * 之上搭的，只把单数修对，`entries` 就会变成 `entrys`。用**表**而不是通用规则同样刻意 —— 英语复数不规则，而
 * `movies` 与 `entries` 结尾相同、解却相反 ⇒ 任何通用规则都必然在其中一侧出错。表外的词保持它们一贯的
 * 朴素 `-s` 行为：**不猜**。
 */
const IRREGULAR_PAIRS = [
  ['person', 'people'],
  ['child', 'children'],
  ['entry', 'entries'],
  ['category', 'categories'],
  ['company', 'companies'],
  ['policy', 'policies'],
  ['currency', 'currencies'],
  ['industry', 'industries'],
  ['delivery', 'deliveries'],
  ['address', 'addresses'],
  ['status', 'statuses'],
  ['box', 'boxes'],
  ['match', 'matches'],
  ['branch', 'branches'],
  ['class', 'classes'],
  ['analysis', 'analyses'],
  ['index', 'indices'],
  ['matrix', 'matrices'],
  ['criterion', 'criteria'],
  ['datum', 'data'],
  ['medium', 'media'],
  // Issue #76 实测：这几个是像样的表名/资源名，而朴素规则把它们剥成 `buse` / `heroe` / `gase` /
  // `quizze` / `shelve` / `vertice`（模块名会一路传到实体文件名与类名）。**补进表**，不加通用规则 ——
  // `cases` 与 `gases` 同尾异解（`case` vs `gas`），任何一条 `-ses` 规则必然错一边。
  ['bus', 'buses'],
  ['gas', 'gases'],
  ['hero', 'heroes'],
  ['quiz', 'quizzes'],
  ['shelf', 'shelves'],
  ['vertex', 'vertices'],
];
const PLURAL_OF_SINGULAR = new Map(IRREGULAR_PAIRS);
const SINGULAR_OF_PLURAL = new Map(IRREGULAR_PAIRS.map(([singular, plural]) => [plural, singular]));

/**
 * Module names are compounds (`points_entries`, `user_profiles`), and only the **last** segment is the
 * head noun, so the table is consulted per segment rather than on the whole name — looking `points_entries`
 * up directly would miss `entries` and leave the defect in place.
 *
 * 模块名是复合词（`points_entries`、`user_profiles`），而只有**最后一段**是中心词，故查表**按段**做而不是
 * 拿整名去查 —— 直接拿 `points_entries` 查会**错过 `entries`**，那个缺陷就原样留着。
 */
const onLastSegment = (name, transform) => {
  const cut = name.lastIndexOf('_');
  return cut < 0 ? transform(name) : `${name.slice(0, cut + 1)}${transform(name.slice(cut + 1))}`;
};

/**
 * The fallback rule, with one guard that costs nothing and saves a word: a trailing `ss` is not a plural
 * (`address`, `class`, `progress`), so it is left alone. `-es` and `-ies` are deliberately **not** handled
 * here — `houses` and `movies` would both be mangled by the obvious rules.
 *
 * 朴素规则，带一条不花钱的守卫：结尾的 `ss` 不是复数（`address`、`class`、`progress`），故不动它。`-es` 与
 * `-ies` **刻意**不在这里处理 —— `houses` 与 `movies` 都会被那两条显然的规则弄坏。
 */
const naiveSingular = (word) =>
  word.endsWith('s') && !word.endsWith('ss') && word.length > 3 ? word.slice(0, -1) : word;

/** 单数：post → post；posts → post；points_entries → points_entry。 */
export function toSingular(name) {
  return onLastSegment(name, (word) => SINGULAR_OF_PLURAL.get(word) ?? naiveSingular(word));
}

/** 复数：post → posts；posts → posts；address → addresses（表外的词仍走朴素 -s）。 */
export function toPlural(name) {
  return onLastSegment(name, (word) => {
    // 表里的**单数**先答（否则朴素规则会先把 `address` 剥成 `addres`，再拼出 `address` —— 原地不动）。
    const knownPlural = PLURAL_OF_SINGULAR.get(word);
    if (knownPlural) return knownPlural;
    const singular = SINGULAR_OF_PLURAL.get(word) ?? naiveSingular(word);
    return PLURAL_OF_SINGULAR.get(singular) ?? `${singular}s`;
  });
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
      // 选项不含冒号（小写英文/下划线）。贪婪匹配之后若紧跟 `:`，说明被吃进来的最后一个
      // token 其实是下一个字段的 `name:type`（`status:enum:a,b,c:date`）——退回该 token 重解，
      // 否则字段名会被吞成选项、同时又多出一个幽灵字段。
      if (m[3] && str[re.lastIndex] === ':') {
        re.lastIndex -= opts.pop().length;
      }
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
 * Whether a field is required: a per-type default plus an explicit override. Single-sourced so the
 * DTO, the entity column and the AI tool's parameter schema cannot disagree about the same spec.
 * - string / enum default required; explicit `required: false` makes them optional.
 * - text / int / bool / date default optional; explicit `required: true` makes them required.
 *
 * 字段是否必填：按类型默认 + 显式覆盖。单源，使 DTO、实体列与 AI 工具参数 schema 对同一份 spec
 * 不可能给出不同答案。
 * - `string` / `enum` 默认必填；显式 `required: false` 改为可选。
 * - `text` / `int` / `bool` / `date` 默认可选；显式 `required: true` 改为必填。
 */
const REQUIRED_BY_DEFAULT = new Set(['string', 'enum']);
export const isRequired = (f) =>
  REQUIRED_BY_DEFAULT.has(f.type) ? f.required !== false : f.required === true;

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
    // label 同理：它在全仓**只有** `templates-ai.mjs` 消费（AI 工具的参数描述），丢掉不报错、只是那道
    // 描述悄悄退回字段名 —— 而仓里已提交的样例**带着标签**，于是「重新生成」与「已提交的样本」不再相等，
    // `check:generated-samples` 正是这么把它抓出来的（2026-10-12）。
    // label must survive for the same reason: it is consumed only by `templates-ai.mjs`（the AI tools'
    // parameter descriptions）, so dropping it is silent — except that the committed samples carry labels,
    // which makes a regeneration differ from what is in the repository（caught by `check:generated-samples`）.
    ...(typeof f.label === 'string' ? { label: f.label } : {}),
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
