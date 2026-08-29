/**
 * AI-23 内容安全（轻量先行版）：用户输入的内容安全检查。
 *
 * 覆盖三层：敏感词（严重违规类别）→ 越狱/无限制模式 → 注入指令（复用 injection-guard）。
 * 定位：基础防线 + 可配置扩展；不做 Prompt Firewall / DLP / 内容审核大赛道。
 * 处置：命中返回结构化拦截信息，由调用方拒绝该请求（不影响正常对话）。
 */

import { detectInjection } from './injection-guard';

/** 基础敏感词：严重违规类别（自残/暴力/违法/儿童安全），聚焦安全不做过宽政治过滤；可按需求扩展配置 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /自杀|自残|轻生|了结自己|结束自己(的)?生命/i,
  /怎么自杀|如何自杀|自杀方法|自杀方式/i,
  /谋杀|买凶|杀人|杀人方法|怎么杀人/i,
  /炸弹|炸药|爆炸物|制造爆炸|自制.*炸弹/i,
  /儿童色情|恋童|虐待儿童|未成年.*(色情|裸体|性)/i,
  /制毒|制造毒品|冰毒|海洛因|可卡因|贩卖毒品/i,
  /恐怖袭击|恐袭|制作.*(恐怖|袭击)|自杀式袭击/i,
];

/** 越狱 / 无限制模式特征（轻量） */
const JAILBREAK_PATTERNS: RegExp[] = [
  /jail\s*break|jailbreak/i,
  /do\s+anything\s+now|DAN\s*模式/i,
  /无限制模式|不受(任何)?限制|突破.*(限制|规则)|越狱/i,
  /忽略.*(安全|规则|限制)|绕过.*(安全|规则|限制)|disable\s+.*(safety|filter|rules)/i,
  /现在是.*(危险|邪恶|无约束).*模式/i,
];

export interface ContentSafetyResult {
  /** 是否拦截（true 时调用方应拒绝请求） */
  blocked: boolean;
  reason?: 'sensitive' | 'jailbreak' | 'injection';
  /** 命中特征描述（供审计/告警，不直接回给用户） */
  detail?: string;
}

/** 用户输入内容安全检查：敏感词 → 越狱 → 注入；命中返回拦截信息，未命中放行。 */
export function checkContentSafety(input: string): ContentSafetyResult {
  if (!input || !input.trim()) return { blocked: false };
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(input)) {
      return { blocked: true, reason: 'sensitive', detail: pattern.source };
    }
  }
  for (const pattern of JAILBREAK_PATTERNS) {
    if (pattern.test(input)) {
      return { blocked: true, reason: 'jailbreak', detail: pattern.source };
    }
  }
  const injection = detectInjection(input);
  if (injection) {
    return { blocked: true, reason: 'injection', detail: injection };
  }
  return { blocked: false };
}
