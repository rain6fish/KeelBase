/** 前端生成 CSV 下载（无后端依赖）。Blob + a[download]。 */

function escapeCell(value: unknown): string {
  let s = String(value ?? '')
  // CR-23：公式注入防护——以 = + - @ 开头的单元格加 ' 前缀，防止 Excel 当公式执行（如 =2+2、@cmd）
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** rows: 列头数组 + 二维数据。文件名含日期。 */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const lines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))]
  const csv = '﻿' + lines.join('\r\n') // BOM 防 Excel 中文乱码
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
