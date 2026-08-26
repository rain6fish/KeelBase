/** D2 人类语言工具标签：toolName（create_followup_task）→ feature 命名空间 ai.tool.* 标签（创建跟进任务）；未命中回退原始名 */

/** create_followup_task → createFollowupTask */
export function toolKey(toolName: string): string {
  return toolName.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

export function toolLabel(feature: Record<string, string> | undefined, toolName: string): string {
  if (!toolName) return '-'
  const key = `ai.tool.${toolKey(toolName)}`
  return feature?.[key] || toolName
}
