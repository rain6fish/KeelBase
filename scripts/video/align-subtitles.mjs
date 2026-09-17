#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 根据录制时的镜头时间轴（shot-log.json）重排官方分镜字幕，并可选烧录进 MP4。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const FFMPEG =
  process.env.FFMPEG_PATH ||
  resolve('D:/tempDowns/APP/.video-tools/node_modules/ffmpeg-static/ffmpeg.exe');

// 计划时间轴来自单一来源 docs/official-video/shot-timing.json（与 build-subtitles.mjs 共用）
const TIMING_PATH = resolve('docs/official-video/shot-timing.json');
const ORIGINAL_SHOTS = JSON.parse(readFileSync(TIMING_PATH, 'utf8')).shots;

function parseSrt(text) {
  return text
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').filter(Boolean);
      if (lines.length < 2) return null;
      const match = lines[1].match(
        /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/,
      );
      if (!match) return null;
      const toMs = (h, m, s, ms) =>
        (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000 + Number(ms);
      return {
        index: Number(lines[0]),
        start: toMs(match[1], match[2], match[3], match[4]),
        end: toMs(match[5], match[6], match[7], match[8]),
        text: lines.slice(2).join('\n'),
      };
    })
    .filter(Boolean);
}

function formatMs(ms) {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const milli = total % 1000;
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
}

function findShot(entryStart) {
  let best = null;
  let bestDistance = Infinity;
  for (const [shot, [start, end]] of Object.entries(ORIGINAL_SHOTS)) {
    if (entryStart >= start && entryStart < end) return Number(shot);
    const distance =
      entryStart < start ? start - entryStart : entryStart - end;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = Number(shot);
    }
  }
  return best;
}

/** 录制脚本对少数镜头（11/13/15）不记录边界，它们的画面就发生在**前一个镜头的时长内**
 *  （例如风险结论是在镜头 10 的段里出现的）。若把这几镜退回计划时间，就会与已按真实轴
 *  重排的相邻镜头重叠、同一时刻叠出两条字幕。故：让每个有边界的镜头**吸收**其后、
 *  直到下一个有边界镜头之前的无边界镜头，在该镜头的真实时长内按计划时长比例切分。 */
function completeTimeline(shotLog) {
  const known = shotLog.slice().sort((a, b) => a.startMs - b.startMs);
  const allShots = Object.keys(ORIGINAL_SHOTS)
    .map(Number)
    .sort((a, b) => a - b);
  const planned = (shot) => {
    const [s, e] = ORIGINAL_SHOTS[shot] || [0, 0];
    return Math.max(e - s, 1);
  };
  const fill = (map, shots, from, to) => {
    if (!shots.length || to <= from) return;
    const total = shots.reduce((sum, s) => sum + planned(s), 0);
    let cursor = from;
    for (const s of shots) {
      const span = ((to - from) * planned(s)) / total;
      map.set(s, { startMs: cursor, endMs: cursor + span });
      cursor += span;
    }
  };

  const first = known[0];
  const map = new Map();
  fill(map, allShots.filter((s) => s < first.shot), 0, first.startMs);
  for (let i = 0; i < known.length; i++) {
    const cur = known[i];
    const nextShot = i + 1 < known.length ? known[i + 1].shot : Infinity;
    const group = [cur.shot, ...allShots.filter((s) => s > cur.shot && s < nextShot)];
    const total = group.reduce((sum, s) => sum + planned(s), 0);
    let cursor = cur.startMs;
    for (const s of group) {
      const span = ((cur.endMs - cur.startMs) * planned(s)) / total;
      map.set(s, { startMs: cursor, endMs: cursor + span });
      cursor += span;
    }
  }
  return map;
}

function align(entries, timeline) {
  return entries.map((entry, index) => {
    const shot = findShot(entry.start);
    const span = timeline.get(shot);
    const [origStart, origEnd] = ORIGINAL_SHOTS[shot] || [0, 0];
    let start = entry.start;
    let end = entry.end;
    if (span && origEnd > origStart) {
      const ratio = (span.endMs - span.startMs) / (origEnd - origStart);
      start = span.startMs + (entry.start - origStart) * ratio;
      end = span.startMs + (entry.end - origStart) * ratio;
      end = Math.min(end, span.endMs);
      if (end <= start) end = Math.min(start + 800, span.endMs);
    }
    return {
      index: index + 1,
      start,
      end,
      text: entry.text,
    };
  });
}

function toSrt(entries) {
  return entries
    .map(
      (entry) =>
        `${entry.index}\n${formatMs(entry.start)} --> ${formatMs(entry.end)}\n${entry.text}`,
    )
    .join('\n\n') + '\n';
}

function burn(input, output, subtitlePath) {
  // Windows 坑：libass 把 `subtitles` 滤镜路径里的冒号当**选项分隔符**，`D:/x.srt` 会被
  // 解析成 original_size 取值而报 "Unable to parse option value ... as image size"。
  // 盘符冒号必须转义为 `\:`。
  const absSubtitle = resolve(subtitlePath)
    .replaceAll('\\', '/')
    .replace(/^([A-Za-z]):/, '$1\\:');
  const filter = `subtitles='${absSubtitle}':force_style='FontName=Microsoft YaHei,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,BorderStyle=1,Outline=1,Shadow=1,Alignment=2,MarginV=30'`;
  // 编码器按容器选：webm 只收 VP8/VP9/AV1，塞 h264 会直接失败
  const webm = output.toLowerCase().endsWith('.webm');
  const codecArgs = webm
    ? ['-c:v', 'libvpx', '-b:v', '2500k']
    : ['-c:v', 'libx264', '-crf', '20', '-preset', 'medium'];
  execFileSync(
    FFMPEG,
    ['-y', '-i', input, '-vf', filter, ...codecArgs, '-c:a', 'copy', output],
    { stdio: 'inherit' },
  );
}

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const shotLogPath = resolve(arg('--shot-log', 'artifacts/official-demo/shot-log.json'));
const srtPath = resolve(
  arg('--srt', 'docs/manual/official-demo-video-subtitles.zh.srt'),
);
const outSrt = resolve(
  arg('--out', 'artifacts/official-demo/subtitles.zh.aligned.srt'),
);
const inputVideo = arg('--input', '');
const outputVideo = arg('--output', '');

if (!existsSync(shotLogPath)) throw new Error(`shot-log 不存在: ${shotLogPath}`);
if (!existsSync(srtPath)) throw new Error(`字幕不存在: ${srtPath}`);

const shotLog = JSON.parse(readFileSync(shotLogPath, 'utf8'));
const entries = parseSrt(readFileSync(srtPath, 'utf8'));
const aligned = align(entries, completeTimeline(shotLog));
writeFileSync(outSrt, toSrt(aligned), 'utf8');
console.log(`[SRT] ${outSrt} (${aligned.length} 条)`);

if (inputVideo && outputVideo) {
  burn(inputVideo, outputVideo, outSrt);
  console.log(`[VIDEO] ${outputVideo}`);
}
