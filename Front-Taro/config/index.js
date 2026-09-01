// SPDX-License-Identifier: Apache-2.0

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
   if (process.env.NODE_ENV === 'development') {
     return merge({}, config, require('./dev'))
   }
   return merge({}, config, require('./prod'))
 }
