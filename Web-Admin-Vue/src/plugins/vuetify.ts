import { createVuetify } from 'vuetify'
import type { ThemeDefinition } from 'vuetify'

// Materio 风格复刻：Material Design 3，卡片圆角 + 轻阴影 + 品牌主色（代码原创，仅对标视觉）
// 主色偏蓝稳重商业；浅色变体供图标底/统计卡背景用
const light: ThemeDefinition = {
  dark: false,
  colors: {
    primary: '#2f6bf5',
    secondary: '#a8aaaf',
    success: '#28c76f',
    warning: '#ff9f43',
    error: '#ea5455',
    info: '#00cfe8',
    surface: '#ffffff',
    background: '#f4f5fa',
    'surface-variant': '#f1f2f4',
    'on-surface': '#4b5563',
    'on-surface-variant': '#6b7280',
    border: '#e5e7eb',
    lightprimary: '#dbe7ff',
    lightinfo: '#d9f5fc',
    lightsuccess: '#e2f6e9',
    lightwarning: '#fff3d9',
    lighterror: '#ffe0e6',
  },
}

const dark: ThemeDefinition = {
  dark: true,
  colors: {
    primary: '#2f6bf5',
    secondary: '#a8aaaf',
    success: '#28c76f',
    warning: '#ff9f43',
    error: '#ea5455',
    info: '#00cfe8',
    surface: '#28243d',
    background: '#16142a',
    'surface-variant': '#312d4b',
    'on-surface': '#cbcbe1',
    'on-surface-variant': '#a2a3bd',
    border: '#4a4a68',
    lightprimary: '#263252',
    lightinfo: '#1c3a44',
    lightsuccess: '#1d3326',
    lightwarning: '#3a3320',
    lighterror: '#3a2530',
  },
}

export default createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: { light, dark },
  },
  defaults: {
    VCard: { rounded: 'md', elevation: 0, border: 'thin' },
    VBtn: { rounded: 'md' },
    VTextField: { variant: 'outlined', density: 'comfortable', rounded: 'lg' },
    VSelect: { variant: 'outlined', density: 'comfortable', rounded: 'lg' },
    VTextarea: { variant: 'outlined', density: 'comfortable', rounded: 'lg' },
  },
})
