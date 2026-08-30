/**
 * AI-23 内容安全（轻量先行版）：用户输入的内容安全检查。
 *
 * 覆盖三层：敏感词（严重违规类别）→ 越狱/无限制模式 → 注入指令（复用 injection-guard）。
 * 定位：基础防线 + 可配置扩展；不做 Prompt Firewall / DLP / 内容审核大赛道。
 * 处置：命中返回结构化拦截信息，由调用方拒绝该请求（不影响正常对话）。
 */

import { detectInjection } from './injection-guard';

/** N-6 可配置内容安全：敏感词/越狱词表存 Settings（ai_content_safety），默认配置即原静态表源 */
export interface ContentSafetyConfig {
  sensitive: string[];
  jailbreak: string[];
}

/** 默认敏感词源：严重违规类别（自残/暴力/违法/儿童安全），聚焦安全不做过宽政治过滤 */
export const DEFAULT_CONTENT_SAFETY: ContentSafetyConfig = {
  sensitive: [
    /自杀|自残|轻生|了结自己|结束自己(的)?生命/i.source,
    /怎么自杀|如何自杀|自杀方法|自杀方式/i.source,
    /谋杀|买凶|杀人|杀人方法|怎么杀人/i.source,
    /炸弹|炸药|爆炸物|制造爆炸|自制.*炸弹/i.source,
    /儿童色情|恋童|虐待儿童|未成年.*(色情|裸体|性)/i.source,
    /制毒|制造毒品|冰毒|海洛因|可卡因|贩卖毒品/i.source,
    /恐怖袭击|恐袭|制作.*(恐怖|袭击)|自杀式袭击/i.source,
  ],
  jailbreak: [
    /jail\s*break|jailbreak/i.source,
    /do\s+anything\s+now|DAN\s*模式/i.source,
    /无限制模式|不受(任何)?限制|突破.*(限制|规则)|越狱/i.source,
    /忽略.*(安全|规则|限制)|绕过.*(安全|规则|限制)|disable\s+.*(safety|filter|rules)/i.source,
    /现在是.*(危险|邪恶|无约束).*模式/i.source,
  ],
};

export interface ContentSafetyResult {
  /** 是否拦截（true 时调用方应拒绝请求） */
  blocked: boolean;
  reason?: 'sensitive' | 'jailbreak' | 'injection';
  /** 命中特征描述（供审计/告警，不直接回给用户） */
  detail?: string;
}

/** 安全构造正则：非法正则（管理台误配）跳过不崩服务 */
function toRegExp(source: string): RegExp | null {
  try {
    return new RegExp(source, 'i');
  } catch {
    return null;
  }
}

/**
 * 用户输入内容安全检查：敏感词 → 越狱 → 注入；命中返回拦截信息，未命中放行。
 * config 为 N-6 动态配置（Settings ai_content_safety），缺省用默认静态表。
 */
export function checkContentSafety(input: string, config?: ContentSafetyConfig): ContentSafetyResult {
  if (!input || !input.trim()) return { blocked: false };
  const sensitive = config?.sensitive?.length ? config.sensitive : DEFAULT_CONTENT_SAFETY.sensitive;
  const jailbreak = config?.jailbreak?.length ? config.jailbreak : DEFAULT_CONTENT_SAFETY.jailbreak;
  for (const source of sensitive) {
    const pattern = toRegExp(source);
    if (pattern?.test(input)) {
      return { blocked: true, reason: 'sensitive', detail: source };
    }
  }
  for (const source of jailbreak) {
    const pattern = toRegExp(source);
    if (pattern?.test(input)) {
      return { blocked: true, reason: 'jailbreak', detail: source };
    }
  }
  const injection = detectInjection(input);
  if (injection) {
    return { blocked: true, reason: 'injection', detail: injection };
  }
  return { blocked: false };
}
