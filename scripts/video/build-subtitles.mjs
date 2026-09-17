#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 由旁白与分镜计划时间轴生成官方 Demo 中英字幕（SRT）。
 *
 * 单一来源：docs/official-video/narration.json（旁白，39 镜 1:1）
 *          docs/official-video/shot-timing.json（计划时间轴，毫秒）
 * 产物：docs/manual/official-demo-video-subtitles.{zh,en}.srt
 *
 * 录制后用 align-subtitles.mjs 按 shot-log.json 的真时间轴重排（本脚本产出的是**计划**轴）。
 * 用法：node scripts/video/build-subtitles.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const NARRATION = resolve('docs/official-video/narration.json');
const TIMING = resolve('docs/official-video/shot-timing.json');
const OUT = {
  zh: resolve('docs/manual/official-demo-video-subtitles.zh.srt'),
  en: resolve('docs/manual/official-demo-video-subtitles.en.srt'),
};

const { shots: narration } = JSON.parse(readFileSync(NARRATION, 'utf8'));
const { shots: timing } = JSON.parse(readFileSync(TIMING, 'utf8'));

function formatMs(ms) {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const milli = total % 1000;
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
}

function build(lang) {
  const cues = [];
  for (const shot of narration) {
    const text = (shot[lang] || '').trim();
    const span = timing[String(shot.id)];
    if (!text || !span) continue; // 无旁白的纯视觉镜不出字幕
    cues.push({ start: span[0], end: span[1], text });
  }
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatMs(cue.start)} --> ${formatMs(cue.end)}\n${cue.text}`,
    )
    .join('\n\n') + '\n';
}

for (const lang of ['zh', 'en']) {
  const srt = build(lang);
  writeFileSync(OUT[lang], srt, 'utf8');
  const count = srt.trim().split(/\n{2,}/).length;
  console.log(`[SRT] ${OUT[lang]} (${count} 条)`);
}
