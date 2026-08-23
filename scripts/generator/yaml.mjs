/**
 * 精简 YAML 子集解析器（零依赖，供 --import-openapi 解析 .yaml/.yml）。
 *
 * 覆盖 OpenAPI 企业 spec 的常见结构，不做完整 YAML 规范：
 *   - 缩进嵌套 map / list（`- ` 项，含嵌套项）
 *   - 标量：裸字符串 / 单双引号 / 数字 / true|false / null
 *   - 行内注释（` #` 之后）与整行注释
 *   - 内联 `{a: 1, b: x}` / `[a, b]`（简单形态）
 *   - 多行文本块（`|`）
 * 不支持：锚点/别名、标签、流式复杂 YAML、多文档 `---`（取首个文档）。
 */

/** 缩进解析：每行 (indent, content)；过滤空行/注释行/文档分隔 */
function lines(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^(\s*)(.*)$/);
    const indent = m[1].length;
    let content = m[2];
    // 去掉行内注释（# 前有空格），引号内 # 不处理（简化）
    const hash = content.indexOf(' #');
    if (hash >= 0) content = content.slice(0, hash);
    content = content.trimEnd();
    if (!content || content.startsWith('#') || content === '---' || content === '...') continue;
    out.push({ indent, content });
  }
  return out;
}

/** 标量推断：null / bool / number / 引号字符串 / 裸字符串 */
function scalar(raw) {
  const v = raw.trim();
  if (v === '' || v === '~' || v === 'null') return null;
  if (v === 'true' || v === 'True' || v === 'TRUE') return true;
  if (v === 'false' || v === 'False' || v === 'FALSE') return false;
  // 引号字符串
  const q = v.match(/^(['"])(.*)\1$/s);
  if (q) return q[2];
  // 数字（含负号/小数/指数）
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) return Number(v);
  return v;
}

/** 解析 `key: rest` 或 `- item`；返回 { key, value } 或 { list: true, value }（list 优先，`- key: v` 也属 list） */
function splitKV(content) {
  const list = content.match(/^-\s+(.*)$/);
  if (list) return { list: true, value: list[1].trim() };
  const m = content.match(/^([^:]+):\s*(.*)$/);
  if (m) return { key: m[1].trim(), value: m[2].trim() };
  return { key: content.trim() }; // 无值 key（嵌套 map 的父）
}

/** 内联 map / list（`{...}` / `[...]`）简单解析 */
function inline(raw) {
  if (raw.startsWith('{') && raw.endsWith('}')) {
    const inner = raw.slice(1, -1).trim();
    const obj = {};
    for (const part of splitTop(inner)) {
      const eq = part.indexOf(':');
      if (eq > 0) obj[part.slice(0, eq).trim()] = scalar(part.slice(eq + 1));
    }
    return obj;
  }
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return splitTop(inner).map((p) => scalar(p));
  }
  return null;
}

/** 顶层逗号切分（忽略引号内逗号，简单实现） */
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  let quote = '';
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = '';
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === '{' || ch === '[') {
      depth++;
      cur += ch;
    } else if (ch === '}' || ch === ']') {
      depth--;
      cur += ch;
    } else if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** 解析缩进树 → JS 对象/数组。
 * 用「实际下一项缩进」作为子级 indent（YAML 缩进宽度不定），父级 indent 仅作层级边界。
 * list 项 `- key: value`（+子级）→ 对象 { key, ...子级 }；`- 标量` → 数组标量。
 */
function build(items, start, indent) {
  const node = {};
  const arr = [];
  let isList = false;
  let i = start;
  while (i < items.length) {
    const it = items[i];
    if (it.indent < indent) break; // 返回上一级
    if (it.indent > indent) {
      i++; // 防御：跳过异常缩进（子级已由上层处理）
      continue;
    }
    const kv = splitKV(it.content);
    const next = items[i + 1];
    const hasChild = !!(next && next.indent > indent);

    if (kv.list) {
      isList = true;
      if (hasChild) {
        const sub = build(items, i + 1, next.indent);
        if (kv.value) {
          // `- key: value`（+ 子级）→ 对象 { key, ...sub }
          const item = splitKV(kv.value);
          arr.push({ [item.key]: scalar(item.value), ...sub });
        } else {
          arr.push(sub);
        }
      } else {
        arr.push(inline(kv.value) ?? scalar(kv.value));
      }
    } else {
      if (hasChild) {
        const sub = build(items, i + 1, next.indent);
        if (kv.value) {
          // key 带标量 + 子级（如属性带 description + type）：标量存 _scalar
          node[kv.key] = { ...sub, _scalar: scalar(kv.value) };
        } else {
          node[kv.key] = sub;
        }
      } else {
        node[kv.key] = inline(kv.value) ?? scalar(kv.value);
      }
    }
    // 跳到本层级末尾（下一项缩进 <= indent）
    if (hasChild) {
      let j = i + 1;
      while (j < items.length && items[j].indent > indent) j++;
      i = j;
    } else {
      i++;
    }
  }
  return isList ? arr : node;
}

/**
 * 递归展平 `{ _scalar, ...rest }`：rest 为空 → 直接标量；否则保留 _scalar 供上层合并。
 * OpenAPI schema 常用「属性名 + description/type」扁平结构，本函数把 _scalar 吸收回对象。
 */
function absorb(node) {
  if (Array.isArray(node)) return node.map((v) => (v && typeof v === 'object' ? absorb(v) : v));
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === 'object' && '_scalar' in v) {
        const { _scalar, ...rest } = v;
        if (Object.keys(rest).length === 0) node[k] = _scalar;
        else node[k] = absorb(rest);
      } else if (v && typeof v === 'object') {
        node[k] = absorb(v);
      }
    }
  }
  return node;
}

/**
 * YAML 文本 → JS 值。
 * @param {string} text
 * @returns {*} 解析结果（对象/数组/标量）
 */
export function parseYaml(text) {
  const items = lines(text);
  if (items.length === 0) return null;
  return absorb(build(items, 0, items[0].indent));
}
