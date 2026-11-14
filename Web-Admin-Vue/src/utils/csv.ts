// SPDX-License-Identifier: Apache-2.0

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

/**
 * rows: the header array plus the two-dimensional data; the filename carries the date.
 *
 * `note` is the optional **scope line**: one `# `-prefixed row written before the header, so a reader
 * sees what the export covers before the table. It is not a column — the header and the data rows are
 * untouched.
 *
 * rows: 列头数组 + 二维数据。文件名含日期。
 *
 * `note` 是可选的**口径行**：写在列头之前、以 `# ` 开头的一行，好让读文件的人在看表之前先看到这份
 * 导出口径读的是什么。它不是一列 —— 列头与数据行原样不动。
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: unknown[][],
  note?: string,
): void {
  const lines = [
    ...(note ? [escapeCell(`# ${note}`)] : []),
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ]
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
