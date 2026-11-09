#!/usr/bin/env bash

# SPDX-License-Identifier: Apache-2.0
#
# Review the release change surface by default (P1-15).
#
# Default mode derives the previous release tag and the current branch, prints the range and the
# changed file list, then runs `ocr review --from <prev> --to <branch>`. A whole-repository scan is
# opt-in: `--full` refuses to run without `--reason`, because the 2026-10-18 measurement showed a
# full scan of 5 repositories costs 4438 requests and CNY 42.54 in about one hour.
#
# 默认只审本次改动面（P1-15）。默认模式自动确定上一发布 tag 与当前分支，打印区间与改动文件
# 清单，然后调用 `ocr review --from <prev> --to <branch>`。全仓扫描必须显式开启：`--full`
# 不带 `--reason` 时直接拒绝；2026-10-18 实测全量扫 5 个仓要 4438 次请求、42.54 元、约一小时。
#
# Usage / 用法:
#   ./scripts/ocr-review-default.sh
#   ./scripts/ocr-review-default.sh --print-range
#   ./scripts/ocr-review-default.sh --from v1.1.0 --to v1.2.0 --print-range
#   ./scripts/ocr-review-default.sh --full --reason "<who / why / estimated cost>"
#   ./scripts/ocr-review-default.sh --help
#
# Exit codes / 退出码:
#   0 success / 成功
#   1 environment problem (git repo, tag, ocr on PATH) / 环境问题
#   2 invalid arguments / 参数错误
#   OCR exit codes are propagated / OCR 的退出码原样透传

set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
ocr-review-default.sh — review the release change surface by default

Usage:
  ./scripts/ocr-review-default.sh [options]

Options:
  --from <ref>     start of the range (default: nearest v* release tag reachable from HEAD)
  --to <ref>       end of the range (default: current branch)
  --print-range    print the range and the changed file list; never invoke OCR
  --full           run `ocr scan` on the whole repository; requires --reason
  --reason <text>  who asked / why / estimated cost; mandatory with --full
  --help           show this help

Default behavior:
  Runs `ocr review --from <from> --to <to>` on the changed files only.
  `--full` prints the measured cost warning and then runs `ocr scan`.

Exit codes: 0 success, 1 environment problem, 2 invalid arguments.

中文用法：
  默认只审本次改动面，执行 `ocr review --from <上一发布 tag> --to <当前分支>`。
  `--print-range` 只打印区间与改动文件清单，不调用 OCR。
  `--full` 全仓扫描必须同时给 `--reason "<谁要 / 为什么 / 预计成本>"`，否则退出码 2。
  退出码：0 成功，1 环境问题，2 参数错误。
EOF
}

PRINT_ONLY=0
FULL=0
REASON=""
FROM=""
TO=""

while [ $# -gt 0 ]; do
  case "$1" in
    --print-range)
      PRINT_ONLY=1
      ;;
    --full)
      FULL=1
      ;;
    --reason)
      if [ $# -lt 2 ]; then
        printf 'ERROR: --reason needs a value.\n' >&2
        printf '错误：--reason 需要一个值。\n' >&2
        exit 2
      fi
      REASON="$2"
      shift
      ;;
    --from)
      if [ $# -lt 2 ]; then
        printf 'ERROR: --from needs a value.\n' >&2
        printf '错误：--from 需要一个值。\n' >&2
        exit 2
      fi
      FROM="$2"
      shift
      ;;
    --to)
      if [ $# -lt 2 ]; then
        printf 'ERROR: --to needs a value.\n' >&2
        printf '错误：--to 需要一个值。\n' >&2
        exit 2
      fi
      TO="$2"
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      printf 'ERROR: unknown argument: %s\n' "$1" >&2
      printf '错误：未知参数：%s\n' "$1" >&2
      printf 'Run with --help for usage.\n' >&2
      printf '运行 --help 查看用法。\n' >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$FULL" -ne 1 ] && [ -n "$REASON" ]; then
  printf 'ERROR: --reason is only meaningful with --full.\n' >&2
  printf '错误：--reason 只能与 --full 一起使用。\n' >&2
  exit 2
fi

if [ "$FULL" -eq 1 ] && [ -z "$REASON" ]; then
  printf 'ERROR: --full requires --reason "<who / why / estimated cost>".\n' >&2
  printf '错误：--full 必须同时给出 --reason "<谁要 / 为什么 / 预计成本>"。\n' >&2
  exit 2
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf 'ERROR: not inside a git repository: %s\n' "$PWD" >&2
  printf '错误：当前目录不在 git 仓库内：%s\n' "$PWD" >&2
  printf 'Run this script from a KeelBase checkout.\n' >&2
  printf '请在 KeelBase 检出目录中运行本脚本。\n' >&2
  exit 1
fi

if [ -z "$TO" ]; then
  TO="$(git rev-parse --abbrev-ref HEAD)"
fi

if [ -z "$FROM" ]; then
  FROM="$(git describe --tags --abbrev=0 --match 'v[0-9]*' HEAD 2>/dev/null || true)"
  if [ -z "$FROM" ]; then
    if [ "$FULL" -eq 1 ]; then
      printf 'NOTE: no release tag (v*) found; a full scan does not need a range.\n' >&2
      printf '提示：未找到发布 tag（v*）；全量扫描不需要区间。\n' >&2
    else
      printf 'ERROR: no release tag (v*) found reachable from HEAD.\n' >&2
      printf '错误：从 HEAD 找不到任何发布 tag（v*）。\n' >&2
      printf 'List tags with `git tag --sort=-creatordate`, or pass --from <tag>.\n' >&2
      printf '用 `git tag --sort=-creatordate` 查看 tag，或显式传 --from <tag>。\n' >&2
      exit 1
    fi
  fi
fi

if [ -n "$FROM" ] && ! git rev-parse --verify --quiet "${FROM}^{commit}" >/dev/null; then
  printf 'ERROR: cannot resolve --from ref: %s\n' "$FROM" >&2
  printf '错误：--from 指向的 ref 无法解析：%s\n' "$FROM" >&2
  printf 'Check it with `git rev-parse --verify <ref>`, or pass a valid tag.\n' >&2
  printf '用 `git rev-parse --verify <ref>` 核对，或换一个有效的 tag。\n' >&2
  exit 1
fi

if ! git rev-parse --verify --quiet "${TO}^{commit}" >/dev/null; then
  printf 'ERROR: cannot resolve --to ref: %s\n' "$TO" >&2
  printf '错误：--to 指向的 ref 无法解析：%s\n' "$TO" >&2
  printf 'Check it with `git rev-parse --verify <ref>`, or pass a valid branch/tag.\n' >&2
  printf '用 `git rev-parse --verify <ref>` 核对，或换一个有效的分支/tag。\n' >&2
  exit 1
fi

FILES=""
COUNT=0
if [ -n "$FROM" ]; then
  FILES="$(git diff --name-only "$FROM" "$TO")"
  if [ -n "$FILES" ]; then
    COUNT="$(printf '%s\n' "$FILES" | wc -l | tr -d ' ')"
  fi
  printf 'Range: %s..%s\n' "$FROM" "$TO"
  printf '区间：%s..%s\n' "$FROM" "$TO"
  printf 'Changed files: %s\n' "$COUNT"
  printf '改动文件数：%s\n' "$COUNT"
  if [ "$COUNT" -gt 0 ]; then
    printf '%s\n' "$FILES"
  fi
fi

if [ "$FULL" -eq 1 ]; then
  printf '\nWARNING: --full scans every file in the repository, not just this diff.\n'
  printf '警告：--full 扫描整个仓库，而不只是本次改动面。\n'
  printf 'Cost reference (2026-10-18): 5 repositories = 4438 requests / CNY 42.54 / about one hour.\n'
  printf '成本参考（2026-10-18 实测）：5 个仓 = 4438 次请求 / 42.54 元 / 约一小时。\n'
  printf 'Reason: %s\n' "$REASON"
  printf '理由：%s\n' "$REASON"
fi

if [ "$PRINT_ONLY" -eq 1 ]; then
  printf '\n%s\n' '--print-range: OCR not invoked.'
  printf '%s\n' '--print-range：未调用 OCR。'
  exit 0
fi

if [ "$FULL" -eq 0 ] && [ "$COUNT" -eq 0 ]; then
  printf 'No changed files in range; nothing to review.\n'
  printf '区间内没有改动文件，无需审查。\n'
  exit 0
fi

if ! command -v ocr >/dev/null 2>&1; then
  printf 'ERROR: `ocr` is not on PATH; refusing to pretend the review ran.\n' >&2
  printf '错误：PATH 中找不到 `ocr`，不会假装审查已执行。\n' >&2
  printf 'Install OpenCodeReview (`npm install -g @alibaba-group/open-code-review`) or put it on PATH, then re-run.\n' >&2
  printf '安装 OpenCodeReview（`npm install -g @alibaba-group/open-code-review`）或把它加入 PATH 后重跑。\n' >&2
  exit 1
fi

if [ "$FULL" -eq 1 ]; then
  printf '\nRunning: ocr scan\n'
  printf '执行：ocr scan\n'
  exec ocr scan
fi

printf '\nRunning: ocr review --from %s --to %s\n' "$FROM" "$TO"
printf '执行：ocr review --from %s --to %s\n' "$FROM" "$TO"
exec ocr review --from "$FROM" --to "$TO"
