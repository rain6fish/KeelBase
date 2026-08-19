// T.5 关键安全模块分档覆盖率门控：在 test:cov 后执行，防止专项覆盖被整体稀释后回退。
// 阈值：statements ≥ 85（auth / casl / operation-audit / ai-tools / headless；2026-08-20 由 60 提高）。
// 原因：jest coverageThreshold 的目录 glob 在 Windows 反斜杠绝对路径下无法匹配（jest 已知问题），
// 故用此脚本按模块精确门控，跨平台一致。
import fs from 'fs';

const THRESHOLD = 85;
const MODULES = [
  { name: 'auth', prefix: 'src/auth/' },
  { name: 'casl', prefix: 'src/common/casl/' },
  { name: 'operation-audit', prefix: 'src/operation-audit/' },
  { name: 'ai-tools', prefix: 'src/ai/tools/' },
  { name: 'governance', prefix: 'src/ai/governance/' },
  { name: 'headless', prefix: 'src/headless/' },
];

const file = process.argv[2] ?? './coverage/coverage-final.json';
if (!fs.existsSync(file)) {
  console.error(`[security-coverage] 未找到 ${file}，请先运行 npm run test:cov`);
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const toSlash = (p) => p.split(String.fromCharCode(92)).join('/');

const results = MODULES.map((mod) => {
  let stFound = 0;
  let stHit = 0;
  for (const [rawPath, cov] of Object.entries(data)) {
    const path = toSlash(rawPath);
    if (!path.includes(mod.prefix)) continue;
    const stm = cov.statementMap || {};
    const s = cov.s || {};
    stFound += Object.keys(stm).length;
    for (const [idx, hit] of Object.entries(s)) if (hit > 0) stHit++;
  }
  const pct = stFound ? (stHit / stFound) * 100 : 0;
  return { ...mod, pct: +pct.toFixed(1) };
});

let failed = false;
for (const r of results) {
  const pass = r.pct >= THRESHOLD;
  if (!pass) failed = true;
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${String(r.pct).padStart(6)}%  ${r.name.padEnd(16)} (statements ≥ ${THRESHOLD}%)`,
  );
}

if (failed) {
  console.error(`\n[security-coverage] 关键安全模块覆盖率未达标（statements < ${THRESHOLD}%），请补充测试。`);
  process.exit(1);
}
console.log(`\n[security-coverage] 全部关键安全模块 statements ≥ ${THRESHOLD}%，门控通过。`);
