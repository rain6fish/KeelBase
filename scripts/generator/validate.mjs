/**
 * EASY-2 生成器：校验 + 命名变换 + 字段解析。
 * 零依赖，供 keelbase-init.mjs 与单测使用。
 */

export const RESERVED_FIELD_NAMES = new Set([
  'id', 'userId', 'createdAt', 'updatedAt', 'deletedAt',
]);

export const FIELD_TYPES = new Set(['string', 'text', 'int', 'bool', 'date']);

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

/** 解析 "title:string,content:text" → [{name,type}]。 */
export function parseFields(str) {
  if (!str) return [];
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [name, type = 'string'] = pair.split(':');
      return { name: name.trim(), type: (type || 'string').trim() };
    });
}

export function validateFields(fields) {
  const seen = new Set();
  for (const f of fields) {
    if (!/^[a-z][a-z0-9_]{0,29}$/.test(f.name)) return `字段名非法：${f.name}`;
    if (RESERVED_FIELD_NAMES.has(f.name)) return `字段名是保留词：${f.name}`;
    if (seen.has(f.name)) return `字段名重复：${f.name}`;
    seen.add(f.name);
    if (!FIELD_TYPES.has(f.type)) {
      return `字段类型非法：${f.name}:${f.type}（支持 string/text/int/bool/date）`;
    }
  }
  return null;
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
