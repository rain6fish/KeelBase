/** 业务语言化：把技术性信息映射为业务人员可读的双语文案（D2 + 业务化改造）。
 *  原则：列表展示业务语言，技术信息（原始工具名/参数 JSON/英语错误）点击详情再展开。 */
import { toolLabel } from './toolLabel'

export { toolLabel }

/** 审计动作语义 key（actionKey）→ 双语标签；i18n 未命中回退英文 fallback / 原始 action */
export function actionLabel(
  key: string | null | undefined,
  fallback: string | null | undefined,
  t: (k: string) => string,
): string {
  if (key) {
    const s = t(key)
    if (s && s !== key) return s
  }
  return fallback || key || '-'
}

/** 后端英语技术错误文案 → 双语文案（识别已知错误，未命中保留原文供详情） */
export function errorLabel(message: string | null | undefined, t: (k: string) => string): string {
  if (!message) return ''
  if (/did not respond in time/i.test(message)) return t('errConfirmTimeout')
  if (/declined the operation|user declined/i.test(message)) return t('errConfirmDeclined')
  if (/streaming chat/i.test(message)) return t('errWriteStreaming')
  if (/permission denied|not authorized|forbidden|无权访问/i.test(message)) return t('errDenied')
  return message
}

/** 工具参数 → 业务摘要（旗舰/高频工具轻量提取；未覆盖返回空串 = 列表不显示，原始参数进详情） */
export function toolArgsSummary(toolName: string | null | undefined, argsStr: string | null | undefined, isZh: boolean): string {
  if (!toolName || !argsStr) return ''
  let a: Record<string, unknown>
  try {
    a = JSON.parse(argsStr) as Record<string, unknown>
  } catch {
    return ''
  }
  const riskLabel = (v: string) =>
    isZh
      ? { low: '低', medium: '中', high: '高', critical: '极危' }[v] ?? v
      : { low: 'low', medium: 'medium', high: 'high', critical: 'critical' }[v] ?? v
  switch (toolName) {
    case 'query_customers': {
      const parts: string[] = []
      if (a.keyword) parts.push(isZh ? `关键词「${a.keyword}」` : `keyword "${a.keyword}"`)
      if (a.riskLevel) parts.push(isZh ? `风险：${riskLabel(String(a.riskLevel))}` : `risk: ${riskLabel(String(a.riskLevel))}`)
      if (a.status) parts.push(isZh ? `状态：${a.status}` : `status: ${a.status}`)
      return parts.length ? `（${parts.join(' · ')}）` : ''
    }
    case 'analyze_customer_risk':
    case 'query_customer_orders':
    case 'query_customer_activities':
    case 'summarize_customer_360':
      return a.customerId != null ? ` #${a.customerId}` : ''
    case 'create_followup_task':
      return a.title ? `「${a.title}」` : ''
    case 'create_event':
      return a.title ? `「${a.title}」` : ''
    case 'create_todo':
      return a.title ? `「${a.title}」` : ''
    case 'create_contract':
      return a.name ? `「${a.name}」` : ''
    case 'create_project_task':
      return a.title ? `「${a.title}」` : ''
    case 'submit_approval_request':
      return a.title ? `「${a.title}」` : ''
    default:
      return ''
  }
}
