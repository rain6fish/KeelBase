/**
 * 官方首批插件：GitHub 集成（P1-7）。
 *
 * - /plugins/github/status：配置状态（GITHUB_TOKEN 有无）
 * - /plugins/github/repos：列出指定 owner 的公开仓库（可选 GITHUB_TOKEN 提升 API 速率限制）
 *
 * 经统一入口 POST /api/v1/plugins/github/repos 访问，body: { owner }。
 */

import { PluginManifest } from '../plugin.interface';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

export const GITHUB_PLUGIN: PluginManifest = {
  name: 'github-plugin',
  version: '1.0.0',
  description: 'GitHub 官方插件：查询公开仓库/组织，可配 GITHUB_TOKEN 提升 API 速率限制',
  capabilities: ['plugin.github', 'plugin.github.status', 'plugin.github.repos'],
  hooks: {
    onAppStart: (ctx) => {
      ctx.registerRoute('/plugins/github/status', () => ({
        plugin: 'github-plugin',
        tokenConfigured: !!GITHUB_TOKEN,
        hint: GITHUB_TOKEN
          ? 'GITHUB_TOKEN 已配置（认证后速率 5000 次/时）'
          : '未配置 GITHUB_TOKEN（公开 API 匿名速率 60 次/时/IP）',
      }));

      ctx.registerRoute('/plugins/github/repos', async (req: any) => {
        const owner = req?.owner || 'rain6fish';
        try {
          const res = await fetch(
            `https://api.github.com/users/${owner}/repos?per_page=5&sort=updated`,
            { headers: GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {} },
          );
          const data = await res.json();
          if (!res.ok) {
            return { ok: false, owner, message: data?.message ?? `GitHub API ${res.status}` };
          }
          const repos = Array.isArray(data) ? data : [];
          return {
            ok: true,
            owner,
            count: repos.length,
            repos: repos.map((r: any) => ({
              name: r.name,
              description: r.description ?? '',
              htmlUrl: r.html_url,
              stars: r.stargazers_count ?? 0,
            })),
          };
        } catch (e) {
          return { ok: false, owner, message: String(e) };
        }
      });
    },
  },
};
