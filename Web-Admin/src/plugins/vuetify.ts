import { createVuetify } from 'vuetify'
import type { ThemeDefinition } from 'vuetify'

// Materio 风格复刻：Material Design 3，卡片圆角 + 轻阴影 + 品牌主色（代码原创，仅对标视觉）
const light: ThemeDefinition = {
  dark: false,
  colors: {
    primary: '#5669ff',
    secondary: '#a8aaaf',
    success: '#28c76f',
    warning: '#ff9f43',
    error: '#ea5455',
    info: '#00cfe8',
    surface: '#ffffff',
    background: '#f4f5fa',
    'surface-variant': '#f1f2f4',
    'on-surface': '#636578',
    'on-surface-variant': '#4b4c5b',
    border: '#d9dae3',
  },
}

const dark: ThemeDefinition = {
  dark: true,
  colors: {
    primary: '#5669ff',
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
    VTextField: { variant: 'outlined', density: 'comfortable' },
    VSelect: { variant: 'outlined', density: 'comfortable' },
  },
})
