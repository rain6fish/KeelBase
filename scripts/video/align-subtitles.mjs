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

const ORIGINAL_SHOTS = {
  1: [0, 5000],
  2: [5000, 9000],
  3: [9000, 13000],
  4: [13000, 18000],
  5: [18000, 20000],
  6: [20000, 32000],
  7: [32000, 40000],
  8: [40000, 45000],
  9: [45000, 52000],
  10: [52000, 58000],
  11: [58000, 65000],
  12: [65000, 72000],
  13: [72000, 80000],
  14: [80000, 85000],
  15: [85000, 92000],
  16: [92000, 100000],
  17: [100000, 110000],
  18: [110000, 118000],
  19: [118000, 125000],
  20: [125000, 130000],
  21: [130000, 135000],
  22: [135000, 148000],
  23: [148000, 155000],
  24: [155000, 162000],
  25: [162000, 167000],
  26: [167000, 172000],
  27: [172000, 175000],
  28: [175000, 182000],
  29: [182000, 194000],
  30: [194000, 202000],
  31: [202000, 205000],
  32: [205000, 218000],
  33: [218000, 225000],
  34: [225000, 232000],
  35: [232000, 236000],
  36: [236000, 238000],
  37: [238000, 240000],
};

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

function align(entries, shotLog) {
  const actual = new Map(shotLog.map((entry) => [entry.shot, entry]));
  return entries.map((entry, index) => {
    const shot = findShot(entry.start);
    const shotActual = actual.get(shot);
    const [origStart, origEnd] = ORIGINAL_SHOTS[shot] || [0, 0];
    let start = entry.start;
    let end = entry.end;
    if (shotActual && origEnd > origStart) {
      const ratio =
        (shotActual.endMs - shotActual.startMs) / (origEnd - origStart);
      start = shotActual.startMs + (entry.start - origStart) * ratio;
      end = shotActual.startMs + (entry.end - origStart) * ratio;
      end = Math.min(end, shotActual.endMs);
      if (end <= start) end = Math.min(start + 800, shotActual.endMs);
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
  const absSubtitle = resolve(subtitlePath).replaceAll('\\', '/');
  const filter = `subtitles='${absSubtitle}':force_style='FontName=Microsoft YaHei,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,BorderStyle=1,Outline=1,Shadow=1,Alignment=2,MarginV=30'`;
  execFileSync(
    FFMPEG,
    [
      '-y',
      '-i',
      input,
      '-vf',
      filter,
      '-c:v',
      'libx264',
      '-crf',
      '20',
      '-preset',
      'medium',
      '-c:a',
      'copy',
      output,
    ],
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
const aligned = align(entries, shotLog);
writeFileSync(outSrt, toSrt(aligned), 'utf8');
console.log(`[SRT] ${outSrt} (${aligned.length} 条)`);

if (inputVideo && outputVideo) {
  burn(inputVideo, outputVideo, outSrt);
  console.log(`[MP4] ${outputVideo}`);
}
