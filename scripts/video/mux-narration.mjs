#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 把每镜旁白音频（edge-tts 生成）按录制时间轴合成进官方 Demo 视频。
 *
 * 输入：
 *   - 视频（无音轨，如 record-official-demo.mjs 产出的 webm）
 *   - artifacts/official-demo/shot-log.json（录制时的真实镜头边界）
 *   - docs/official-video/narration.json（每镜中英旁白文案）
 *   - 旁白音频目录 <audio-dir>/<lang>/NN.mp3（NN 为两位镜头号）
 * 输出：带旁白音轨的 mp4
 *
 * 对齐规则：每个有边界的镜头吸收其后直到下一个有边界镜头之前的镜头（如 11/13/15 落在
 * 连续录屏段内），其旁白按顺序从该窗口起点铺开；窗口装不下时对该窗口音频做 atempo 压缩（上限 1.5x）。
 *
 * 用法：
 *   node scripts/video/mux-narration.mjs --input <video.webm> --lang zh --output <out.mp4>
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const MAX_TEMPO = 1.5;

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function probeDuration(file) {
  const out = execFileSync(
    FFPROBE,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
    { encoding: 'utf8' },
  );
  return Number(out.trim()) || 0;
}

/** 按录制边界把镜头分组：每个边界镜头吸收其后无边界镜头，直到下一个边界镜头。 */
function buildWindows(shotLog, narrationShots) {
  const known = shotLog.slice().sort((a, b) => a.startMs - b.startMs);
  const all = narrationShots.slice().sort((a, b) => a - b);
  const windows = [];
  for (let i = 0; i < known.length; i++) {
    const cur = known[i];
    const nextShot = i + 1 < known.length ? known[i + 1].shot : Infinity;
    const startMs = cur.startMs;
    const endMs = i + 1 < known.length ? known[i + 1].startMs : known[i].endMs;
    const group = all.filter(
      (s) => s >= cur.shot && (i + 1 < known.length ? s < nextShot : s >= cur.shot),
    );
    windows.push({ startMs, endMs, shots: group });
  }
  // 边界镜头之前若还有更早的镜头（首帧前），并入第一个窗口
  const firstShot = known[0].shot;
  const before = all.filter((s) => s < firstShot);
  if (before.length) windows[0].shots = [...before, ...windows[0].shots];
  return windows;
}

const shotLogPath = resolve(arg('--shot-log', 'artifacts/official-demo/shot-log.json'));
const narrationPath = resolve(arg('--narration', 'docs/official-video/narration.json'));
const audioDir = resolve(arg('--audio-dir', join(tmpdir(), 'keelbase-audio')));
const lang = arg('--lang', 'zh');
const inputVideo = arg('--input', '');
const outputVideo = arg('--output', '');

if (!inputVideo || !outputVideo) {
  throw new Error('用法: --input <video> --output <out.mp4> [--lang zh|en]');
}
for (const p of [shotLogPath, narrationPath, inputVideo]) {
  if (!existsSync(p)) throw new Error(`文件不存在: ${p}`);
}

const shotLog = JSON.parse(readFileSync(shotLogPath, 'utf8'));
const narration = JSON.parse(readFileSync(narrationPath, 'utf8'));
const textOf = new Map(narration.shots.map((s) => [s.id, s[lang] || '']));

const videoDuration = probeDuration(inputVideo);
const windows = buildWindows(shotLog, narration.shots.map((s) => s.id));

// 逐窗口排布：窗口内按序铺开旁白；装不下则对该窗口音频做 atempo 压缩
const placements = [];
let overflowWindows = 0;
for (const w of windows) {
  const clips = [];
  for (const shot of w.shots) {
    if (!textOf.get(shot)) continue;
    const file = join(audioDir, lang, `${String(shot).padStart(2, '0')}.mp3`);
    if (!existsSync(file)) continue;
    clips.push({ shot, file, duration: probeDuration(file) });
  }
  if (!clips.length) continue;
  const windowSec = (w.endMs - w.startMs) / 1000;
  const needSec = clips.reduce((sum, c) => sum + c.duration, 0);
  let tempo = 1;
  if (needSec > windowSec && windowSec > 0) {
    tempo = Math.min(needSec / windowSec, MAX_TEMPO);
    overflowWindows += 1;
  }
  let cursor = w.startMs / 1000;
  for (const c of clips) {
    const effective = c.duration / tempo;
    placements.push({ ...c, atSec: cursor, tempo });
    cursor += effective;
  }
}

if (!placements.length) throw new Error('没有可用的旁白音频，请先运行 gen-narration-audio.py');

const workDir = resolve('artifacts/official-demo/narration-mix');
mkdirSync(workDir, { recursive: true });

// 构建音轨：静音底 + 各片段 adelay 后 amix
const inputs = ['-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo:d=${videoDuration.toFixed(3)}`];
const filters = [];
const mixLabels = ['[0:a]'];
placements.forEach((p, i) => {
  inputs.push('-i', p.file);
  const delayMs = Math.max(0, Math.round(p.atSec * 1000));
  const chain = p.tempo > 1.0001
    ? `atempo=${p.tempo.toFixed(4)},adelay=${delayMs}|${delayMs}`
    : `adelay=${delayMs}|${delayMs}`;
  filters.push(`[${i + 1}:a]${chain}[a${i}]`);
  mixLabels.push(`[a${i}]`);
});
filters.push(
  `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:normalize=0[out]`,
);

const audioWav = join(workDir, `narration.${lang}.wav`);
execFileSync(
  FFMPEG,
  [
    '-y',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[out]',
    '-c:a', 'pcm_s16le',
    '-t', videoDuration.toFixed(3),
    audioWav,
  ],
  { stdio: 'inherit' },
);
console.log(`[AUDIO] ${audioWav}（${placements.length} 段旁白，${overflowWindows} 个窗口压缩）`);

// 合流：按容器选编码（VP8 不能装进 MP4——copy 会让 MP4 头部写入失败）
const isWebm = outputVideo.toLowerCase().endsWith('.webm');
const videoArgs = isWebm
  ? ['-c:v', 'copy']
  : ['-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p'];
const audioArgs = isWebm ? ['-c:a', 'libopus', '-b:a', '128k'] : ['-c:a', 'aac', '-b:a', '128k'];
execFileSync(
  FFMPEG,
  [
    '-y',
    '-i', inputVideo,
    '-i', audioWav,
    '-map', '0:v:0',
    '-map', '1:a:0',
    ...videoArgs,
    ...audioArgs,
    '-shortest',
    outputVideo,
  ],
  { stdio: 'inherit' },
);
console.log(`[VIDEO] ${outputVideo}`);
