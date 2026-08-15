import type { ReactNode } from 'react'
import { Box, Card, CardContent, Typography } from '@mui/material'

type StatColor = 'primary' | 'info' | 'success' | 'warning' | 'error'

// 浅色底映射：主色语义色 → 对应 light 变体（供图标底色，对齐 Matdash 统计卡形态）
interface StatCardProps {
  label: string
  value: string | number
  icon: ReactNode
  color?: StatColor
  hint?: string
}

export function StatCard({ label, value, icon, color = 'primary', hint }: StatCardProps) {
  return (
    <Card>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            bgcolor: (theme) => theme.palette.light[color],
            color: (theme) => theme.palette[color].main,
            fontSize: 26,
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h5" fontWeight="bold">
            {value}
          </Typography>
          {hint ? (
            <Typography variant="caption" color="text.secondary">
              {hint}
            </Typography>
          ) : null}
        </Box>
      </CardContent>
    </Card>
  )
}
