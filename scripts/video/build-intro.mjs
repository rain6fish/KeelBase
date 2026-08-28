#!/usr/bin/env node
/**
 * 把 docs/intro/keelbase-project-intro.md 渲染成视频开头展示页 HTML。
 * 输出：docs/intro/keelbase-project-intro.html
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { marked } from 'marked';

const root = new URL('../../', import.meta.url);
const mdPath = new URL('docs/intro/keelbase-project-intro.md', root);
const htmlPath = new URL('docs/intro/keelbase-project-intro.html', root);

const markdown = readFileSync(mdPath, 'utf8');
const body = marked.parse(markdown, { gfm: true, breaks: true });

const page = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=1280" />
  <title>KeelBase 项目介绍</title>
  <style>
    :root {
      --bg: #0b1220;
      --panel: #101a2e;
      --text: #e8eef7;
      --muted: #9fb0c7;
      --teal: #2dd4bf;
      --amber: #fbbf24;
      --line: #24344f;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background:
        radial-gradient(900px 420px at 82% -8%, rgba(45, 212, 191, 0.16), transparent 60%),
        radial-gradient(700px 380px at 8% 108%, rgba(251, 191, 36, 0.10), transparent 55%),
        linear-gradient(180deg, #0b1220 0%, #0e1730 100%);
      color: var(--text);
      font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
      line-height: 1.65;
    }
    .wrap {
      max-width: 1120px;
      margin: 0 auto;
      padding: 56px 64px 80px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 42px;
      line-height: 1.2;
      background: linear-gradient(90deg, #7dd3fc 0%, #2dd4bf 55%, #fbbf24 110%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    h2 {
      margin: 34px 0 10px;
      font-size: 24px;
      color: #7dd3fc;
      border-bottom: 1px solid var(--line);
      padding-bottom: 8px;
    }
    h3 { margin: 22px 0 8px; font-size: 18px; color: #a5f3fc; }
    p { margin: 8px 0; }
    blockquote {
      margin: 18px 0;
      padding: 14px 18px;
      border-left: 4px solid var(--teal);
      background: rgba(45, 212, 191, 0.08);
      border-radius: 0 10px 10px 0;
      color: #d9f9f3;
    }
    code {
      background: #182741;
      border-radius: 6px;
      padding: 2px 6px;
      font-size: 0.92em;
    }
    pre {
      background: #0d1626;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 14px 16px;
      overflow-x: auto;
    }
    pre code { background: transparent; padding: 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 18px;
      font-size: 14px;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    th { background: rgba(45, 212, 191, 0.10); color: #a5f3fc; }
    td { background: rgba(16, 26, 46, 0.5); color: var(--text); }
    hr { border: none; border-top: 1px solid var(--line); margin: 28px 0; }
    img { max-width: 100%; border-radius: 10px; border: 1px solid var(--line); }
    a { color: #67e8f9; }
    strong { color: #fde68a; }
  </style>
</head>
<body>
  <main class="wrap">${body}</main>
</body>
</html>
`;

writeFileSync(htmlPath, page, 'utf8');
console.log(`intro html written: ${htmlPath.pathname}`);
