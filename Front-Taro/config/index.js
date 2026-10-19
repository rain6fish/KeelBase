// SPDX-License-Identifier: Apache-2.0

const fs = require('fs')
const path = require('path')

const APP_ROOT = path.resolve(__dirname, '..')

// Taro turns every key in `config.env` into a webpack DefinePlugin entry. A `process.env.*` reference whose
// key is not in that list stays in the bundle as a bare `process`, which crashes the H5 build in the browser.
// Seed the keys this project reads so they are always replaced; `.env` / `.env.local` still wins because the
// Taro CLI patches `config.env` from those files after this module is loaded.
// Taro 会把 `config.env` 的每个键变成 webpack DefinePlugin 条目。不在该表里的 `process.env.*` 引用会以
// 裸 `process` 留在产物中，导致 H5 在浏览器里崩溃。这里为项目读取的键提供兜底；`.env` / `.env.local`
// 仍然优先——Taro CLI 在本模块加载之后才用这些文件覆盖 `config.env`。
function readTaroAppEnvFiles() {
  const mode = process.env.NODE_ENV || 'production'
  const values = {}
  for (const file of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    const full = path.join(APP_ROOT, file)
    if (!fs.existsSync(full)) continue
    for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line)
      if (!match || !match[1].startsWith('TARO_APP_')) continue
      let value = match[2].trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      values[match[1]] = value
    }
  }
  return values
}

function resolveTaroAppEnv() {
  const fromFiles = readTaroAppEnvFiles()
  return {
    TARO_APP_API_BASE: fromFiles.TARO_APP_API_BASE || process.env.TARO_APP_API_BASE || '',
    TARO_APP_WX_TEMPLATE_ID: fromFiles.TARO_APP_WX_TEMPLATE_ID || process.env.TARO_APP_WX_TEMPLATE_ID || '',
  }
}

function reportUnset(resolved) {
  const isWeapp = process.env.TARO_ENV === 'weapp'
  const isH5 = process.env.TARO_ENV === 'h5'

  if (!resolved.TARO_APP_API_BASE) {
    if (isWeapp) {
      console.warn(
        '[front-taro] TARO_APP_API_BASE is not set: the weapp build will call http://localhost:3000/api/v1. ' +
          'Set TARO_APP_API_BASE in Front-Taro/.env.local before shipping.\n' +
          '[front-taro] 未设置 TARO_APP_API_BASE：小程序包将请求 http://localhost:3000/api/v1。' +
          '发版前请在 Front-Taro/.env.local 中设置 TARO_APP_API_BASE。'
      )
    } else if (isH5) {
      console.info(
        '[front-taro] TARO_APP_API_BASE is not set: H5 uses the same-origin /api/v1 default. ' +
          'Set TARO_APP_API_BASE in Front-Taro/.env.local to point elsewhere.\n' +
          '[front-taro] 未设置 TARO_APP_API_BASE：H5 使用同源 /api/v1 默认值。' +
          '如需指向别处，请在 Front-Taro/.env.local 中设置 TARO_APP_API_BASE。'
      )
    }
  }

  if (isWeapp && !resolved.TARO_APP_WX_TEMPLATE_ID) {
    console.info(
      '[front-taro] TARO_APP_WX_TEMPLATE_ID is not set: WeChat subscription-message reminders stay disabled. ' +
        'Set it in Front-Taro/.env.local to enable them.\n' +
        '[front-taro] 未设置 TARO_APP_WX_TEMPLATE_ID：微信订阅消息提醒保持关闭。' +
        '如需启用，请在 Front-Taro/.env.local 中设置。'
    )
  }
}

 const config = {
   projectName: 'front-taro',
   date: '2026-7-27',
   designWidth: 750,
   deviceRatio: {
     640: 2.34 / 2,
     750: 1,
     828: 1.81 / 2,
     375: 2,
   },
   sourceRoot: 'src',
   outputRoot: 'dist',
   plugins: ['@tarojs/plugin-platform-h5'],
   defineConstants: {},
   copy: {
     patterns: [],
     options: {},
   },
   framework: 'vue3',
   compiler: 'webpack5',
   cache: {
     enable: false,
   },
   mini: {
     postcss: {
       pxtransform: {
         enable: true,
         config: {},
       },
       url: {
         enable: true,
         config: {
           limit: 1024,
         },
       },
       cssModules: {
         enable: false,
         config: {
           namingPattern: 'module',
           generateScopedName: '[name]__[local]___[hash:base64:5]',
         },
       },
     },
   },
   h5: {
     publicPath: '/',
     staticDirectory: 'static',
     postcss: {
       autoprefixer: {
         enable: true,
         config: {},
       },
       cssModules: {
         enable: false,
         config: {
           namingPattern: 'module',
           generateScopedName: '[name]__[local]___[hash:base64:5]',
         },
       },
     },
     esnextModules: ['taro-ui'],
   },
 }
 
 module.exports = function (merge) {
   const resolved = resolveTaroAppEnv()
   reportUnset(resolved)

   const defines = Object.fromEntries(
     Object.entries(resolved).map(([key, value]) => [key, JSON.stringify(value)])
   )
   const base = Object.assign({}, config, { env: defines })

   if (process.env.NODE_ENV === 'development') {
     return merge({}, base, require('./dev'))
   }
   return merge({}, base, require('./prod'))
 }
