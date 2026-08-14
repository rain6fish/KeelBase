/**
 * EASY-2.1：自然语言描述 → 业务模块规格（module/label/fields）。
 * 调用 OpenAI 兼容 LLM（DeepSeek 或本地 Ollama），零依赖（fetch）。
 *
 * 配置（复用后端 env 约定）：
 *   - 云端：DEEPSEEK_API_KEY（必需）+ DEEPSEEK_BASE_URL（默认 https://api.deepseek.com）+ LLM_MODEL（默认 deepseek-chat）
 *   - 本地：OLLAMA_BASE_URL（无需 key）+ OLLAMA_MODEL（默认 qwen2.5:7b）
 */

/** 读取 LLM 配置；未配置返回 null。 */
export function llmConfig(env = process.env) {
  const ollama = (env.OLLAMA_BASE_URL || '').trim();
  const apiKey = (env.DEEPSEEK_API_KEY || '').trim();
  if (ollama) {
    return {
      endpoint: `${ollama.replace(/\/+$/, '')}/v1/chat/completions`,
      apiKey: '',
      model: (env.OLLAMA_MODEL || '').trim() || 'qwen2.5:7b',
    };
  }
  if (apiKey) {
    const base = (env.DEEPSEEK_BASE_URL || '').trim() || 'https://api.deepseek.com';
    return {
      endpoint: `${base.replace(/\/+$/, '')}/chat/completions`,
      apiKey,
      model: (env.LLM_MODEL || '').trim() || 'deepseek-chat',
    };
  }
  return null;
}

/** 构造提取 prompt：要求 LLM 只输出 JSON。 */
export function buildSpecPrompt(description) {
  return `你是 KeelBase 业务模块识别器。根据用户对业务模块的描述，提取模块规格，只输出 JSON（不要任何解释、不要代码块标记）。JSON 格式：
{"module":"英文复数小写 snake_case 模块名，如 books","label":"中文标签 2-6 字","fields":[{"name":"字段英文 snake_case","type":"string|text|int|bool|date","label":"字段中文名"}]}

规则：
- module 只含小写字母/数字/下划线，如 books、user_profiles
- 至少 1 个 string 字段（如 title/name）
- 字段类型：string=短文本≤200 / text=长文本 / int=整数 / bool=布尔 / date=日期
- 不要包含 id/userId/createdAt/updatedAt/deletedAt（系统自动加）
- fields 3-6 个；字段名小写 snake_case；type 只允许上述五种

用户描述：${description}`;
}

/** 解析 LLM 响应文本 → { module, label, fields }。容错：去代码块围栏、截取 JSON 对象。 */
export function parseSpecResponse(raw) {
  let text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('LLM 未返回 JSON 对象');
  const obj = JSON.parse(text.slice(start, end + 1));
  const fields = (obj.fields || []).map((f) => {
    if (typeof f === 'string') {
      const [n, t = 'string'] = f.split(':');
      return { name: n.trim(), type: (t || 'string').trim() };
    }
    return { name: (f.name || '').trim(), type: (f.type || 'string').trim() };
  });
  return { module: String(obj.module || '').trim(), label: String(obj.label || '').trim(), fields };
}

/**
 * 调用 LLM 提取模块规格。返回 { ok:true, spec } 或 { ok:false, error }。
 * fetchImpl 可注入（测试用）；env 可注入（测试/自定义）。
 */
export async function extractSpec(description, { fetchImpl = fetch, env = process.env } = {}) {
  const cfg = llmConfig(env);
  if (!cfg) {
    return { ok: false, error: '未配置 LLM：请设置 DEEPSEEK_API_KEY（云端）或 OLLAMA_BASE_URL（本地 Ollama）' };
  }
  let res;
  try {
    res = await fetchImpl(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'system', content: buildSpecPrompt(description) }],
        temperature: 0,
        stream: false,
      }),
    });
  } catch (e) {
    return { ok: false, error: `LLM 请求失败：${e.message}` };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, error: `LLM API ${res.status}: ${body.slice(0, 200)}` };
  }
  const data = await res.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return { ok: false, error: 'LLM 响应无内容' };
  try {
    return { ok: true, spec: parseSpecResponse(content) };
  } catch (e) {
    return { ok: false, error: `LLM 响应解析失败：${e.message}。原始：${content.slice(0, 200)}` };
  }
}
