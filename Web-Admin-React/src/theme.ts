import { createTheme, type Theme } from '@mui/material/styles'

// Materio 风格复刻：Material Design 3，卡片圆角 + 轻阴影 + 品牌主色（与 Vue 版 plugins/vuetify.ts 配色对齐）
// 浅色变体（light*）供图标底/统计卡背景用
declare module '@mui/material/styles' {
  interface Palette {
    light: {
      primary: string
      info: string
      success: string
      warning: string
      error: string
    }
  }
  interface PaletteOptions {
    light?: {
      primary?: string
      info?: string
      success?: string
      warning?: string
      error?: string
    }
  }
}

const FONT = "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"

const shared = {
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: FONT,
    button: { textTransform: 'none' as const },
  },
}

function baseTheme(dark: boolean): Theme {
  const light = dark
    ? {
        primary: { main: '#2f6bf5', contrastText: '#ffffff' },
        secondary: { main: '#a8aaaf' },
        success: { main: '#28c76f', contrastText: '#ffffff' },
        warning: { main: '#ff9f43', contrastText: '#ffffff' },
        error: { main: '#ea5455', contrastText: '#ffffff' },
        info: { main: '#00cfe8', contrastText: '#ffffff' },
        background: { default: '#16142a', paper: '#28243d' },
        text: { primary: '#cbcbe1', secondary: '#a2a3bd' },
        divider: '#4a4a68',
        light: { primary: '#263252', info: '#1c3a44', success: '#1d3326', warning: '#3a3320', error: '#3a2530' },
      }
    : {
        primary: { main: '#2f6bf5', contrastText: '#ffffff' },
        secondary: { main: '#a8aaaf' },
        success: { main: '#28c76f', contrastText: '#ffffff' },
        warning: { main: '#ff9f43', contrastText: '#ffffff' },
        error: { main: '#ea5455', contrastText: '#ffffff' },
        info: { main: '#00cfe8', contrastText: '#ffffff' },
        background: { default: '#f4f5fa', paper: '#ffffff' },
        text: { primary: '#4b5563', secondary: '#6b7280' },
        divider: '#e5e7eb',
        light: { primary: '#dbe7ff', info: '#d9f5fc', success: '#e2f6e9', warning: '#fff3d9', error: '#ffe0e6' },
      }

  return createTheme({
    ...shared,
    palette: { mode: dark ? 'dark' : 'light', ...light },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: light.background.default },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: `1px solid ${light.divider}`,
            borderRadius: 12,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            textTransform: 'none',
            boxShadow: 'none',
          },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small' },
      },
      MuiSelect: {
        defaultProps: { size: 'small' },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            marginBottom: 2,
            '&.Mui-selected': {
              backgroundColor: '#2f6bf5',
              color: '#ffffff',
              boxShadow: '0 4px 14px 0 rgba(47,107,245,0.4)',
              '& .MuiListItemIcon-root': { color: '#ffffff' },
              '& .MuiTypography-root': { fontWeight: 600 },
              '&:hover': { backgroundColor: '#2f6bf5' },
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
    },
  })
}

export const lightTheme = baseTheme(false)
export const darkTheme = baseTheme(true)
