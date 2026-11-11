#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Generate the full-tree CycloneDX 1.6 SBOM that CI validates and the release job attaches.
#
# One definition for the scanner version, its digest and the scan flags: the CI job that proves the BOM
# covers every lockfile and the release job that attaches it to a GitHub Release run this same file, so
# the release asset cannot differ from the artifact CI checked.
#
# The scanner is downloaded at a pinned version and checked against a pinned digest — a floating
# "latest" would make the BOM's contents depend on when the job ran. Exit 1 from the scan means
# "vulnerabilities found" and is accepted here; the BOM is an inventory, not a verdict.
#
# 生成 CI 会校验、发版 job 会附上的全仓 CycloneDX 1.6 SBOM。
#
# 扫描器版本、摘要与扫描参数只有这一份定义：证明 BOM 覆盖每份锁文件的 CI job、把 BOM 附到 GitHub Release
# 的发版 job，跑的是同一个文件，于是发版资产不可能与 CI 核过的那份不同。
#
# 扫描器按钉住的版本下载、并按钉住的摘要校验 —— 用「latest」会让 BOM 的内容取决于 job 何时跑。扫描的退出码 1
# 表示「找到漏洞」，这里接受；BOM 是清单，不是判定。
#
# Usage / 用法: bash scripts/generate-sbom.sh [output] [log]
#   defaults / 默认: sbom.cdx.json / sbom-scan.log (relative to the repository root / 相对仓根)
set -euo pipefail

OSV_SCANNER_VERSION="${OSV_SCANNER_VERSION:-2.7.0}"
OSV_SCANNER_SHA256="${OSV_SCANNER_SHA256:-160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b}"
OUT="${1:-sbom.cdx.json}"
LOG="${2:-sbom-scan.log}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BIN="${OSV_SCANNER:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/osv-scanner}"

curl -sSfL -o "$BIN" \
  "https://github.com/google/osv-scanner/releases/download/v${OSV_SCANNER_VERSION}/osv-scanner_linux_amd64"
echo "${OSV_SCANNER_SHA256}  $BIN" | sha256sum -c -
chmod +x "$BIN"
"$BIN" --version

set +e
"$BIN" scan source -r "$ROOT" --format cyclonedx-1-6 --all-packages --no-ignore \
  --output-file "$OUT" > "$LOG" 2>&1
rc=$?
set -e
cat "$LOG"
if [ "$rc" -ne 0 ] && [ "$rc" -ne 1 ]; then
  echo "::error::osv-scanner SBOM generation exited $rc (0 = clean, 1 = findings; anything else is not a scan)" >&2
  exit "$rc"
fi

# An SBOM that silently covers less than the gate is worse than none.
# 一份悄悄少覆盖的 SBOM 比没有更糟。
node scripts/check-sbom-coverage.mjs --selftest
node scripts/check-sbom-coverage.mjs --sbom "$OUT" --scan-log "$LOG"
