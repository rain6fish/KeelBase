// SPDX-License-Identifier: Apache-2.0

/**
 * 示例插件 hello-plugin（PL-11）。
 *
 * 演示插件机制三个能力：
 * - registerRoute：注册 /plugins/hello HTTP 端点
 * - onAppStart：启动钩子
 * - capabilities：声明能力供三端展示
 */

import { PluginManifest } from '../plugin.interface';

export const HELLO_PLUGIN: PluginManifest = {
  name: 'hello-plugin',
  version: '1.0.0',
  description: '示例插件：注册一个 hello 端点并演示生命周期钩子',
  capabilities: ['plugin.hello'],
  hooks: {
    onAppStart: (ctx) => {
      ctx.registerRoute('/plugins/hello', (req) => {
        return {
          hello: 'world',
          featureAiEnabled: ctx.isFeatureEnabled('ai'),
          timestamp: new Date().toISOString(),
        };
      });
    },
  },
};
