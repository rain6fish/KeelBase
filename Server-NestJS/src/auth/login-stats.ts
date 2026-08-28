/**
 * 登录页访问统计（ECS demo 需求）：记录 IP / 操作系统 / 浏览器 / 时间，追加写入 data/login-stats.log。
 * 文件在 /app/server/data（容器 volume 持久化），定时初始化（reset 清库）与容器重建（升级）都不触碰该文件。
 */
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export function parseUserAgent(ua: string): { os: string; browser: string } {
  let os = 'unknown';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  let browser = 'unknown';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  return { os, browser };
}

/** 追加一行访问记录；不抛异常（统计失败不应影响登录体验） */
export function recordLoginStats(ip: string | undefined, ua: string | undefined): void {
  try {
    const { os, browser } = parseUserAgent(ua ?? '');
    const dir = join(process.cwd(), 'data');
    mkdirSync(dir, { recursive: true });
    const line = `${new Date().toISOString()}\t${ip ?? '-'}\t${os}\t${browser}\n`;
    appendFileSync(join(dir, 'login-stats.log'), line, 'utf8');
  } catch {
    // 静默：写文件失败不影响登录
  }
}
