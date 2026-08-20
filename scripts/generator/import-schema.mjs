/**
 * P0-12 输入通道：SQL DDL → Module Protocol。
 *
 * 从 SQL 的 CREATE TABLE 语句提取表/列，映射为 Protocol 字段供 keelbase init 生成模块。
 * 零依赖（正则解析，容忍注释/IF NOT EXISTS/约束行），纯函数便于单测。
 *
 * 映射规则：
 *   - TEXT/CLOB → text；VARCHAR/CHAR(≤255) → string，超长 → text
 *   - INTEGER/BIGINT/SERIAL/REAL/DECIMAL 等 → int；BOOLEAN → bool；DATE/DATETIME/TIMESTAMP → date
 *   - 列级 CHECK ... IN ('a','b')（2-10 个合法小写选项）→ enum
 *   - id / created_at / updated_at / deleted_at → 跳过（基座自带）
 *   - 约束行（PRIMARY/UNIQUE/FOREIGN/CHECK 顶层）跳过；object/关系列（user_id 等 FK）保持手写，保留为 int 列
 */

import { toPlural } from './validate.mjs';

const SKIP_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'deleted_at']);
const VALID_OPTION = /^[a-z][a-z0-9_]{0,24}$/;

export function parseSqlDdl(sql, opts = {}) {
  if (typeof sql !== 'string' || !sql.trim()) return { error: '空的 SQL' };

  const tables = extractTables(sql);
  if (tables.length === 0) return { error: '未找到 CREATE TABLE 语句' };

  const pick = opts.table && tables.some((t) => t.name === opts.table) ? opts.table : tables[0].name;
  const table = tables.find((t) => t.name === pick);
  const { fields, skipped } = table.columns;
  if (fields.length === 0) {
    return { error: `表「${pick}」没有可转换的标量列（id 除外）` };
  }

  const module = opts.module ?? toPlural(pick);
  const label = opts.label ?? pick;
  return { module, label, fields, skipped };
}

/** 按分号切块，每个含 CREATE TABLE 的块解析出 { name, columns[] } */
function extractTables(sql) {
  const cleaned = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const tables = [];
  for (const block of cleaned.split(';')) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const m = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([a-zA-Z_][a-zA-Z0-9_]*)[`"]?\s*\(([\s\S]*)\)\s*$/i.exec(trimmed);
    if (!m) continue;
    tables.push({ name: m[1], columns: parseColumns(m[2]) });
  }
  return tables;
}

/** 列定义按顶层逗号切分（忽略括号内的逗号，如 enum 列表 / 函数默认值） */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function parseColumns(body) {
  const cols = [];
  const skipped = [];
  for (const line of splitTopLevel(body)) {
    const t = line.trim();
    if (!t) continue;
    // 顶层约束行（PRIMARY KEY/UNIQUE/FOREIGN KEY/CHECK/INDEX/CONSTRAINT/KEY）跳过
    if (/^(PRIMARY|UNIQUE|FOREIGN|CHECK|INDEX|CONSTRAINT|KEY|REFERENCES)\b/i.test(t)) {
      skipped.push({ name: t.split(/\s+/)[0].toLowerCase(), reason: '约束行（索引/关系，保持手写）' });
      continue;
    }

    const colMatch = /^[`"]?([a-zA-Z_][a-zA-Z0-9_]*)[`"]?\s+([A-Za-z0-9_() ]+)/.exec(t);
    if (!colMatch) {
      skipped.push({ name: (t.split(/[\s(]/)[0] || t).slice(0, 30), reason: '列定义无法解析' });
      continue;
    }
    const name = colMatch[1];
    if (SKIP_COLUMNS.has(name)) {
      skipped.push({ name, reason: '保留字段（基座自带，不生成）' });
      continue;
    }

    const typePart = colMatch[2].trim();
    // 取类型第一个 token：VARCHAR(100) → VARCHAR；BOOLEAN DEFAULT 0 → BOOLEAN
    const base = typePart.split(/[\s(]/)[0].toUpperCase();
    const lenMatch = /\((\d+)\)/.exec(typePart);
    const length = lenMatch ? Number(lenMatch[1]) : null;
    const enumOptions = extractEnumOptions(t);

    const type = sqlTypeToField(base, length, enumOptions);
    if (!type) {
      skipped.push({ name, reason: `未知类型 ${base}，未转换` });
      continue;
    }
    const col = type === 'enum' ? { name, type: 'enum', enum: enumOptions } : { name, type };
    if (/NOT\s+NULL/i.test(t)) col.required = true;
    cols.push(col);
  }
  return { fields: cols, skipped };
}

/** 列级 CHECK ... IN ('a','b') → 合法小写选项列表 */
function extractEnumOptions(line) {
  const m = /IN\s*\(\s*('[^']*'(?:\s*,\s*'[^']*')*)\s*\)/i.exec(line);
  if (!m) return [];
  return (m[1].match(/'([^']*)'/g) ?? [])
    .map((s) => s.slice(1, -1))
    .filter((o) => VALID_OPTION.test(o));
}

function sqlTypeToField(base, length, enumOptions) {
  if (enumOptions.length >= 2 && enumOptions.length <= 10) return 'enum';
  switch (base) {
    case 'TEXT':
    case 'CLOB':
    case 'BLOB':
      return 'text';
    case 'VARCHAR':
    case 'CHAR':
    case 'CHARACTER':
    case 'NVARCHAR':
    case 'STRING':
      return length !== null && length > 255 ? 'text' : 'string';
    case 'INT':
    case 'INTEGER':
    case 'BIGINT':
    case 'SMALLINT':
    case 'TINYINT':
    case 'MEDIUMINT':
    case 'SERIAL':
    case 'BIGSERIAL':
    case 'REAL':
    case 'DOUBLE':
    case 'FLOAT':
    case 'DECIMAL':
    case 'NUMERIC':
      return 'int';
    case 'BOOLEAN':
    case 'BOOL':
      return 'bool';
    case 'DATE':
    case 'DATETIME':
    case 'TIMESTAMP':
    case 'TIME':
      return 'date';
    default:
      return null;
  }
}
