/** 前端生成 CSV 下载（无后端依赖）。Blob + a[download]。 */

function escapeCell(value: unknown): string {
  const s = String(value ?? '')
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
