/**
 * 官方首批插件：飞书（Feishu）集成（P1-7）。
 *
 * - /plugins/feishu/status：配置状态（FEISHU_APP_ID/SECRET 有无）
 * - /plugins/feishu/send：向指定 receive_id（open_id/chat_id）发文本消息
 *
 * 经统一入口 POST /api/v1/plugins/feishu/send 访问，body: { receiveId, text }。
 * 未配置凭据时返回配置引导（不静默失败）。
 */

import { PluginManifest } from '../plugin.interface';

const FEISHU_APP_ID = process.env.FEISHU_APP_ID || '';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '';

const configured = () => !!(FEISHU_APP_ID && FEISHU_APP_SECRET);

async function tenantAccessToken(): Promise<string> {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }),
  });
  const data = await res.json();
  return data?.tenant_access_token ?? '';
}

export const FEISHU_PLUGIN: PluginManifest = {
  name: 'feishu-plugin',
  version: '1.0.0',
  description: '飞书官方插件：向指定用户/群发文本消息（需 FEISHU_APP_ID/FEISHU_APP_SECRET）',
  capabilities: ['plugin.feishu', 'plugin.feishu.status', 'plugin.feishu.send'],
  hooks: {
    onAppStart: (ctx) => {
      ctx.registerRoute('/plugins/feishu/status', () => ({
        plugin: 'feishu-plugin',
        configured: configured(),
        hint: configured()
          ? '已配置 FEISHU_APP_ID/FEISHU_APP_SECRET'
          : '未配置 FEISHU_APP_ID/FEISHU_APP_SECRET，无法发消息',
      }));

      ctx.registerRoute('/plugins/feishu/send', async (req: any) => {
        if (!configured()) {
          return {
            ok: false,
            message: '未配置 FEISHU_APP_ID/FEISHU_APP_SECRET；配置后重启生效',
            howToConfigure: '设置 FEISHU_APP_ID + FEISHU_APP_SECRET（飞书开放平台 → 应用 → 凭证与基础信息）',
          };
        }
        const receiveId = req?.receiveId;
        const text = req?.text;
        if (!receiveId || !text) {
          return { ok: false, message: '需要 receiveId + text（receiveId 类型：open_id / chat_id）' };
        }
        try {
          const token = await tenantAccessToken();
          if (!token) {
            return { ok: false, message: '获取飞书 tenant_access_token 失败' };
          }
          const res = await fetch(
            'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                receive_id: receiveId,
                msg_type: 'text',
                content: JSON.stringify({ text }),
              }),
            },
          );
          const data = await res.json();
          return { ok: res.ok, message: data?.msg ?? `飞书 API ${res.status}` };
        } catch (e) {
          return { ok: false, message: String(e) };
        }
      });
    },
  },
};
