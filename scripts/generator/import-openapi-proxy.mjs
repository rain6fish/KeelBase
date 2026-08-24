/**
 * B 路径 openapi-proxy 生成器（AI Bridge §4 完整 B）：OpenAPI operations → 代理工具配置。
 *
 * 从 OpenAPI 3 / Swagger 2 的 `paths` 段，把每条业务 operation 转换为 ProxyTool 配置，
 * 输出 `ai_proxy_tools` Settings 形态（运行时 ProxyToolRegistryService 动态注册）：
 *   { baseUrl, audience, tools: [{ name, description, method, path, parameters, riskLevel }] }
 *
 * 映射规则：
 *   - name：operationId（camelCase → snake_case）；缺省 `{method}_{path}`；冲突追加序号
 *   - path：OpenAPI 路径模板 `{param}` 与 ProxyTool 的 `{param}` URL 占位同构，直接透传
 *   - parameters：path 参数（必填）+ query 参数（required 才必填）+ requestBody JSON schema 属性（body 字段）
 *   - riskLevel：`x-keelbase-risk-level` 扩展显式覆盖；缺省 读 GET=R1 / 写 POST·PUT·PATCH·DELETE=R3
 *   - header 参数跳过（通常是鉴权/常量，记入 skipped 诊断）
 *
 * 零依赖、纯函数便于单测（类型映射与 import-openapi.mjs 保持一致口径）。
 */

const OPERATION_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** OpenAPI 参数名 → 合法 tool 参数名；非法返回 null 跳过 */
function sanitizeParamName(name) {
  const n = String(name).replace(/[-\s]/g, '_');
  return /^[a-z][a-zA-Z0-9_]{0,29}$/.test(n) ? n : null;
}

/** operationId "getCustomers" → "get_customers"；非法则 null（用 method_path 兜底） */
function sanitizeToolName(operationId) {
  if (typeof operationId !== 'string' || !operationId.trim()) return null;
  const snake = operationId
    .replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`)
    .replace(/^_/, '')
    .replace(/[^a-z0-9_]/g, '_');
  return /^[a-z][a-z0-9_]{0,39}$/.test(snake) ? snake : null;
}

/** YAML 子集解析器把嵌套 flow-map 存为字符串（如 "{ type: integer }"，键值未加引号非严格 JSON）→ 尽量还原。 */
function resolveSchema(schema) {
  if (typeof schema !== 'string') return schema;
  const s = schema.trim();
  if (!s.startsWith('{') && !s.startsWith('[')) return schema;
  try {
    return JSON.parse(s);
  } catch {
    // 非严格 JSON（flow-map 无引号）→ 正则提取 type 即可（代理参数主要关心类型）
    const type = s.match(/\btype:\s*([a-zA-Z0-9_]+)/);
    return type ? { type: type[1] } : schema;
  }
}

/** OpenAPI schema 类型 → ToolParameter JSON schema 类型；复杂/未知 → 'string'（Agent 按文本传） */
function mapProxyType(prop) {
  prop = resolveSchema(prop);
  if (!prop || typeof prop !== 'object') return 'string';
  switch (prop.type) {
    case 'integer':
      return 'integer';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
    case 'object':
      return 'string'; // 复杂结构：Agent 提供 JSON 文本，服务端透传
    default:
      return 'string';
  }
}

/** 去掉会破坏 JSON 描述文本的引号/反斜杠/换行，限长。 */
function sanitizeLabel(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/['\\\n\r]/g, '').trim();
  return s ? (s.length > 120 ? s.slice(0, 120) : s) : null;
}

/** 内部 $ref（#/components/schemas/X）→ 指向的 schema 对象；非 $ref 原样返回。 */
function deref(schema, spec) {
  if (!schema || typeof schema !== 'object') return schema;
  if (typeof schema.$ref === 'string') {
    const m = schema.$ref.match(/#\/components\/schemas\/(.+)$/);
    if (m) {
      const name = decodeURIComponent(m[1]);
      const target = spec.components?.schemas?.[name] ?? spec.definitions?.[name];
      if (target && typeof target === 'object') return deref(target, spec);
    }
  }
  return schema;
}

/** operation.requestBody → 有效负载 schema（JSON content 优先，$ref 已解引用）。 */
function requestBodySchema(op, spec) {
  const rb = op.requestBody;
  if (!rb || typeof rb !== 'object') return null;
  const content = rb.content ?? {};
  const ct = content['application/json'] ?? content['*/*'];
  return ct?.schema ? deref(ct.schema, spec) : null;
}

/** 单条 operation → ProxyToolConfig；无法转换返回 null。 */
function operationToTool(method, path, pathItem, operation, spec) {
  // path 占位符重写为清洗后的参数名：OpenAPI `{customer-id}` → `{customer_id}`（与 parameters 的 name 对齐，
  // ProxyTool 按占位符名从 args 取值；若不清洗，args 用 customer_id 而路径找 customer-id → 缺参失败）
  const rewrittenPath = path.replace(/\{([^{}]+)\}/g, (m, p) => `{${sanitizeParamName(p) ?? p}}`);
  const pathSlug = rewrittenPath.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_');
  const nameBase = sanitizeToolName(operation.operationId) || `${method.toLowerCase()}_${pathSlug}`;
  const parameters = [];
  const queryParams = [];
  const seen = new Set();
  const skipped = [];

  const allParams = [...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []), ...(Array.isArray(operation.parameters) ? operation.parameters : [])];
  for (const p of allParams) {
    if (!p || typeof p !== 'object') continue;
    const pname = sanitizeParamName(p.name);
    if (!pname || seen.has(pname)) continue;
    if (p.in === 'header') {
      skipped.push({ name: pname, reason: 'header 参数（通常为鉴权/常量，跳过）' });
      continue;
    }
    if (p.in !== 'path' && p.in !== 'query') continue;
    seen.add(pname);
    if (p.in === 'query') queryParams.push(pname);
    parameters.push({
      name: pname,
      type: mapProxyType(resolveSchema(p.schema) ?? p),
      description: sanitizeLabel(p.description) ?? '',
      required: p.in === 'path' || p.required === true,
    });
  }

  const bodySchema = requestBodySchema(operation, spec);
  if (bodySchema && typeof bodySchema.properties === 'object') {
    const requiredSet = new Set(Array.isArray(bodySchema.required) ? bodySchema.required : []);
    for (const [rawName, prop] of Object.entries(bodySchema.properties)) {
      const name = sanitizeParamName(rawName);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      parameters.push({
        name,
        type: mapProxyType(prop),
        description: sanitizeLabel(prop?.description ?? prop?.title) ?? '',
        required: requiredSet.has(rawName),
      });
    }
  }

  const tagPrefix = Array.isArray(operation.tags) && operation.tags.length ? `[${operation.tags.join('/')}] ` : '';
  const summary = sanitizeLabel(operation.summary ?? operation.description) ?? `${method} ${path}`;

  return {
    name: nameBase,
    description: `${tagPrefix}${summary}（B 路径代理：${method} ${rewrittenPath}）`,
    method,
    path: rewrittenPath,
    parameters,
    queryParams,
    riskLevel: operation['x-keelbase-risk-level'] ?? (WRITE_METHODS.includes(method) ? 'R3' : 'R1'),
    skipped,
  };
}

/**
 * OpenAPI spec → ai_proxy_tools 配置（baseUrl/audience 由调用方注入）。
 * 返回 { baseUrl, audience, tools, skipped, available }；spec 无效/无 paths 时 { error }。
 */
export function parseOpenApiProxy(spec, opts = {}) {
  if (!spec || typeof spec !== 'object') return { error: '无效的 OpenAPI JSON' };
  const paths = spec.paths;
  if (!paths || typeof paths !== 'object' || Object.keys(paths).length === 0) {
    return { error: '未找到可用 operations（需 OpenAPI `paths` 段，含至少一个 GET/POST/PUT/PATCH/DELETE）' };
  }

  const tools = [];
  const skipped = [];
  const seenNames = new Set();
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      const m = method.toUpperCase();
      if (!OPERATION_METHODS.includes(m)) continue; // parameters/summary/description 等键跳过
      if (!operation || typeof operation !== 'object') continue;
      const tool = operationToTool(m, path, pathItem, operation, spec);
      if (!tool) continue;
      skipped.push(...(tool.skipped ?? []).map((s) => ({ ...s, tool: tool.name })));
      delete tool.skipped;
      // 名称冲突（operationId 重复/缺省派生）→ 追加序号保持唯一
      let name = tool.name;
      if (seenNames.has(name)) {
        let i = 2;
        while (seenNames.has(`${name}_${i}`)) i += 1;
        name = `${name}_${i}`;
        tool.name = name;
      }
      seenNames.add(name);
      tools.push(tool);
    }
  }

  if (tools.length === 0) return { error: '`paths` 中没有可转换的 operations（至少一个 HTTP 方法）' };
  return {
    baseUrl: opts.baseUrl ?? '',
    audience: opts.audience ?? '',
    tools,
    skipped,
    available: tools.map((t) => t.name),
  };
}
