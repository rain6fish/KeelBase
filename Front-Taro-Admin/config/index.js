 const config = {
   projectName: 'front-taro-admin',
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
   framework: 'react',
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
     // 子路径部署（与主 App 同域名 /admin 子路径）时设 ADMIN_BASE_PATH=admin
     //（无斜杠前缀，规避 MSYS/Docker 路径转换差异）
     publicPath: process.env.ADMIN_BASE_PATH ? `/${process.env.ADMIN_BASE_PATH}/` : '/',
     staticDirectory: 'static',
     postcss: {
       pxtransform: {
         enable: false, // 桌面管理台：禁用 750 设计稿缩放，px 按真实值渲染
       },
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
   if (process.env.NODE_ENV === 'development') {
     return merge({}, config, require('./dev'))
   }
   return merge({}, config, require('./prod'))
 }
