/**
 * 官方首批插件：企业微信（WeCom）集成（P1-7）。
 *
 * - /plugins/wecom/status：配置状态（WECOM_CORP_ID/AGENT_ID/SECRET 有无）
 * - /plugins/wecom/send：给指定成员/标签发文本消息
 *
 * 经统一入口 POST /api/v1/plugins/wecom/send 访问，body: { touser, text }。
 * 未配置凭据时返回配置引导（不静默失败）。
 */

import { PluginManifest } from '../plugin.interface';

const WECOM_CORP_ID = process.env.WECOM_CORP_ID || '';
const WECOM_AGENT_ID = process.env.WECOM_AGENT_ID || '';
const WECOM_SECRET = process.env.WECOM_SECRET || '';

const configured = () => !!(WECOM_CORP_ID && WECOM_AGENT_ID && WECOM_SECRET);

export const WECOM_PLUGIN: PluginManifest = {
  name: 'wecom-plugin',
  version: '1.0.0',
  description: '企业微信官方插件：给指定成员/群发文本消息（需 WECOM_CORP_ID/AGENT_ID/SECRET）',
  capabilities: ['plugin.wecom', 'plugin.wecom.status', 'plugin.wecom.send'],
  hooks: {
    onAppStart: (ctx) => {
      ctx.registerRoute('/plugins/wecom/status', () => ({
        plugin: 'wecom-plugin',
        configured: configured(),
        hint: configured()
          ? '已配置 WECOM_CORP_ID/WECOM_AGENT_ID/WECOM_SECRET'
          : '未配置 WECOM_CORP_ID/WECOM_AGENT_ID/WECOM_SECRET',
      }));

      ctx.registerRoute('/plugins/wecom/send', async (req: any) => {
        if (!configured()) {
          return {
            ok: false,
            message: '未配置 WECOM_CORP_ID/WECOM_AGENT_ID/WECOM_SECRET；配置后重启生效',
            howToConfigure: '设置 WECOM_CORP_ID + WECOM_AGENT_ID + WECOM_SECRET（企业微信管理后台 → 应用管理 → 自建应用）',
          };
        }
        const text = req?.text;
        if (!text) {
          return { ok: false, message: '需要 text（消息内容）' };
        }
        try {
          const tokenRes = await fetch(
            `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECOM_CORP_ID}&corpsecret=${WECOM_SECRET}`,
          );
          const tokenData = await tokenRes.json();
          if (!tokenData?.access_token) {
            return { ok: false, message: '获取企业微信 access_token 失败' };
          }
          const res = await fetch(
            `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${tokenData.access_token}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                touser: req?.touser ?? '@all',
                msgtype: 'text',
                agentid: Number(WECOM_AGENT_ID),
                text: { content: text },
              }),
            },
          );
          const data = await res.json();
          return { ok: data?.errcode === 0, message: data?.errmsg ?? `企业微信 API ${res.status}` };
        } catch (e) {
          return { ok: false, message: String(e) };
        }
      });
    },
  },
};
