#!/usr/bin/env node
// 非工作时间时间映射工具（post-commit / post-merge 共用）
// 输入：<author-iso> <committer-iso>（git log --format=%ai / %ci 格式）
// 输出：<映射后author>|<映射后committer>；不需要映射的时间输出 KEEP
'use strict';
const [a, c] = process.argv.slice(2);

function shift(iso) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, tz] = m;
  const dow = new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay(); // 0=周日 6=周六
  const isWeekday = dow >= 1 && dow <= 5;
  const mm = (+h) * 60 + (+mi);
  if (!isWeekday || mm < 300 || mm >= 1140) return null; // 工作日 05:00-19:00
  const nm = 1140 + Math.floor((mm - 300) * 480 / 840); // → 当天 19:00 至次日 03:00
  let nh = Math.floor(nm / 60);
  const nmi = String(nm % 60).padStart(2, '0');
  if (nh >= 24) { // 跨午夜：目标落在次日 00:00-03:00
    const next = new Date(Date.UTC(+y, +mo - 1, +d + 1));
    return next.getUTCFullYear() + '-' + String(next.getUTCMonth() + 1).padStart(2, '0') + '-' + String(next.getUTCDate()).padStart(2, '0') + ' ' + String(nh - 24).padStart(2, '0') + ':' + nmi + ':' + s + ' ' + tz;
  }
  return y + '-' + mo + '-' + d + ' ' + String(nh).padStart(2, '0') + ':' + nmi + ':' + s + ' ' + tz;
}

console.log((shift(a) || 'KEEP') + '|' + (shift(c) || 'KEEP'));
