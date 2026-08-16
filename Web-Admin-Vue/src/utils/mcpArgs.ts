/** 从 JSON Schema 生成参数模板（空值占位），供 MCP 调用对话框预填。 */
export function buildArgumentsTemplate(schema?: Record<string, unknown>): string {
  const props = (schema?.properties ?? {}) as Record<
    string,
    { type?: string | string[] }
  >
  const required = Array.isArray(schema?.required) ? (schema.required as string[]) : []
  const args: Record<string, unknown> = {}
  for (const [name, def] of Object.entries(props)) {
    const type = Array.isArray(def.type) ? def.type[0] : def.type
    if (type === 'integer' || type === 'number') args[name] = 0
    else if (type === 'boolean') args[name] = false
    else if (type === 'array') args[name] = []
    else args[name] = required.includes(name) ? '' : null
  }
  return JSON.stringify(args, null, 2)
}
