// SPDX-License-Identifier: Apache-2.0

 module.exports = {
   env: {
     NODE_ENV: '"development"'
   },
   defineConstants: {},
   mini: {},
   h5: {
     // DEP-5：dev 时把 /api 代理到后端，配合同源相对路径 API_BASE_URL
     devServer: {
       proxy: {
         '/api': {
           target: 'http://localhost:3000',
           changeOrigin: true
         }
       }
     }
   }
 }
