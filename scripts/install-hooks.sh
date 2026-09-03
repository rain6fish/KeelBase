#!/usr/bin/env sh
# SPDX-License-Identifier: Apache-2.0
# 安装 KeelBase「非工作时间提交」hook（从仓库内 .githooks/ 生效，随仓库走）。
# 任何新 clone / 新机器：在仓库根目录执行  sh scripts/install-hooks.sh  一次即可。
# hook 会：工作日 05:00-19:00 的提交自动映射到当天 19:00-次日 03:00（author+committer）；
#          工作时间只提交不推送（pre-push 拦截）。
set -e
cd "$(dirname "$0")/.."
git config core.hooksPath .githooks
echo "OK — core.hooksPath = $(git config core.hooksPath)（hook 已启用：工作日提交自动映射到晚间）"
