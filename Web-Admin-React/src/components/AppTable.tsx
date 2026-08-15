import type { ReactNode } from 'react'
import { Card, CircularProgress, LinearProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'

export interface AppColumn<T> {
  key: string
  title: string
  width?: string | number
  render?: (row: T) => ReactNode
}

interface AppTableProps<T> {
  headers: AppColumn<T>[]
  items: T[]
  loading?: boolean
  emptyText?: string
  /** 底部插槽（分页等） */
  bottom?: ReactNode
}

/** 普通 MUI Table：items 直接渲染（分页由父组件 AppPagination 控制，无需 server 模式） */
export function AppTable<T extends { id?: number | string }>({ headers, items, loading, emptyText, bottom }: AppTableProps<T>) {
  const colSpan = headers.length || 1
  return (
    <Card>
      {loading ? <LinearProgress /> : null}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {headers.map((h) => (
                <TableCell key={h.key} sx={{ fontWeight: 600, ...(h.width ? { width: h.width } : {}) }}>
                  {h.title}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={colSpan} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={32} />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">{emptyText ?? '-'}</Typography>
                </TableCell>
              </TableRow>
            ) : (
              items.map((row, i) => (
                <TableRow key={(row.id as string | number | undefined) ?? i} hover>
                  {headers.map((h) => (
                    <TableCell key={h.key}>{h.render ? h.render(row) : String((row as Record<string, unknown>)[h.key] ?? '')}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {bottom}
    </Card>
  )
}
