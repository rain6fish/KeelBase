// SPDX-License-Identifier: Apache-2.0

/**
 * EASY-2 生成器：校验 + 命名变换 + 字段解析。
 * 零依赖，供 keelbase-init.mjs 与单测使用。
 */

export const RESERVED_FIELD_NAMES = new Set([
  'id', 'userId', 'createdAt', 'updatedAt', 'deletedAt',
]);

export const FIELD_TYPES = new Set(['string', 'text', 'int', 'bool', 'date', 'enum']);

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
      return `字段类型非法：${f.name}:${f.type}（支持 string/text/int/bool/date/enum）`;
    }
    if (f.type === 'enum') {
      if (!Array.isArray(f.enum) || f.enum.length < 2 || f.enum.length > 10) {
        return `enum 字段 ${f.name} 需提供 2-10 个选项（协议 JSON 的 enum 数组）`;
      }
      for (const opt of f.enum) {
        if (typeof opt !== 'string' || !/^[a-z][a-z0-9_]{0,24}$/.test(opt)) {
          return `enum 选项非法：${f.name}.${opt}（需小写英文/下划线，如 active、in_progress）`;
        }
      }
    }
  }
  return null;
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
