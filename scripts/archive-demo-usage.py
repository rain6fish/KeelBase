#!/usr/bin/env python3

# SPDX-License-Identifier: Apache-2.0
#
# KeelBase Demo 用量归档（初始化前留存「系统访问 + AI 使用」情况）
#
# 在 demo 环境（ECS）重置演示数据之前，把上一窗口的系统访问与 AI 使用情况单独留存下来供分析。
# 按水位（游标）增量导出，只取上次归档之后的新增，因此可反复安全运行。
#
# 数据源（全部只读）：
#   ai_audit_logs         AI 对话/工具调用审计（含 model / token / 业务意图）—— 重置不删，但会持续增长
#   operation_audit_logs  登录与写操作审计（who / what / ip / 状态码）—— 重置不删
#   ai_conversations      对话元数据（不含消息正文）—— **重置会 TRUNCATE，故单独留档**
#   nginx access log      全部 HTTP 访问（含读请求）—— 走 docker json-file，**容器重建即清零**
#
# 水位只在本轮归档成功落盘后才推进，因此归档失败不会丢数据，下次运行会用同一窗口重试。
#
# 用法（在 ECS 上，仓库根或部署目录均可）：
#   python3 scripts/archive-demo-usage.py
#   python3 scripts/archive-demo-usage.py --compose-dir /opt/keelbase --out /opt/keelbase/usage-archive
#
# 产物：<out>/<YYYYMMDD-HHMMSS>/{meta.json, SUMMARY.md, ai-usage.json, ai-usage.jsonl.gz,
#       access.json, access.jsonl.gz, operations.json, conversations.jsonl.gz}
# 保留：<out> 下只保留最近 --keep 份（默认 3），更早的整目录删除。

import argparse
import gzip
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

STATE_FILE = ".state.json"
FORMAT = "keelbase-demo-usage-archive/1"

# 与在线端点 audit.service.ts getActionReport 的「拒绝/阻断」判定保持一致，
# 避免同一业务规则出现第二个实现（CLAUDE.md §15.7）。
BLOCKED_RE = re.compile(r"blocked|denied|拒绝|越权|R5|禁用|禁止|无权", re.IGNORECASE)

# nginx main 格式：$remote_addr - $remote_user [$time_local] "$request" $status
#                 $body_bytes_sent "$http_referer" "$http_user_agent" "$http_x_forwarded_for"
ACCESS_RE = re.compile(
    r'^(?P<ip>\S+) \S+ (?P<user>\S+) \[(?P<ts>[^\]]+)\] '
    r'"(?P<request>(?:[^"\\]|\\.)*)" '
    r'(?P<status>\d{3}) (?P<bytes>\S+) '
    r'"(?P<referer>(?:[^"\\]|\\.)*)" '
    r'"(?P<ua>(?:[^"\\]|\\.)*)"'
    r'(?: "(?P<xff>(?:[^"\\]|\\.)*)")?'
)

MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
TS_RE = re.compile(r"^(\d{2})/(\w{3})/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$")


def log(msg):
    print(msg, flush=True)


def utc_now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def parse_nginx_ts(raw):
    """17/Sep/2026:02:00:24 +0000 → 带时区 datetime。不用 strptime %b，避免受 locale 影响。"""
    m = TS_RE.match(raw.strip())
    if not m:
        return None
    day, mon, year, hh, mm, ss, off = m.groups()
    if mon not in MONTHS:
        return None
    sign = 1 if off[0] == "+" else -1
    tz = timezone(sign * timedelta(hours=int(off[1:3]), minutes=int(off[3:5])))
    return datetime(int(year), MONTHS[mon], int(day), int(hh), int(mm), int(ss), tzinfo=tz)


def parse_db_ts(raw):
    """'2026-09-17T02:41:22.813Z'（库内为 UTC 无时区）→ aware datetime。"""
    if not raw:
        return None
    return datetime.fromisoformat(raw.replace("Z", "+00:00"))


def iso(dt):
    return None if dt is None else dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def run(cmd, cwd=None):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, errors="replace")


class Compose:
    """通过 docker compose 访问 postgres 与 web（日志），全部只读。"""

    def __init__(self, compose_dir, env_file):
        self.dir = compose_dir
        self.env_file = env_file
        self.pg_user = self._env("POSTGRES_USER")
        self.pg_db = self._env("POSTGRES_DB")
        if not self.pg_user or not self.pg_db:
            sys.exit(f"✗ 无法从 {env_file} 读取 POSTGRES_USER / POSTGRES_DB")

    def _env(self, key):
        if not os.path.isfile(self.env_file):
            return None
        with open(self.env_file, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith(f"{key}="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
        return None

    def psql_json(self, sql):
        """执行 SELECT，返回 json_agg 结果（解析为 Python 对象）。"""
        res = run(["docker", "compose", "exec", "-T", "postgres",
                   "psql", "-U", self.pg_user, "-d", self.pg_db, "-t", "-A", "-c", sql],
                  cwd=self.dir)
        if res.returncode != 0:
            raise RuntimeError(f"psql 失败：{res.stderr.strip()[:500]}")
        out = res.stdout.strip()
        if not out:
            return []
        return json.loads(out)

    def access_lines(self, since_iso=None):
        cmd = ["docker", "compose", "logs", "web", "--no-log-prefix"]
        if since_iso:
            cmd += ["--since", since_iso]
        res = run(cmd, cwd=self.dir)
        if res.returncode != 0:
            raise RuntimeError(f"docker compose logs web 失败：{res.stderr.strip()[:500]}")
        return res.stdout.splitlines()

    def access_log_retention_start(self, max_scan=200):
        """日志当前保留的最早一条访问时间——用于判定容器重建造成的缺口。

        只读前 max_scan 行即断开；超过仍未找到访问记录则返回 None（不臆断保留起点）。
        """
        proc = subprocess.Popen(
            ["docker", "compose", "logs", "web", "--no-log-prefix"],
            cwd=self.dir, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, errors="replace")
        try:
            for i, line in enumerate(proc.stdout):
                if i >= max_scan:
                    return None
                m = ACCESS_RE.match(line)
                if m:
                    ts = parse_nginx_ts(m.group("ts"))
                    if ts:
                        return ts
        finally:
            proc.stdout.close()
            proc.terminate()
            proc.wait()
        return None


# ── 各数据源抽取 ────────────────────────────────────────────────────────────

def fetch_ai_audit(cx, after_id):
    rows = cx.psql_json(f"""
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
          SELECT id, user_id, username, conversation_id, action, model, provider,
                 prompt_tokens, completion_tokens, duration_ms, is_error, error_message,
                 business_intent, source, ip, feedback,
                 to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
          FROM ai_audit_logs WHERE id > {int(after_id)} ORDER BY id
        ) t""")
    for r in rows:
        r["createdAt"] = parse_db_ts(r.pop("created_at"))
    return rows


def fetch_operation_audit(cx, after_id):
    rows = cx.psql_json(f"""
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
          SELECT id, user_id, action, method, path, target_id, status_code, ip,
                 feature_key, business_event, request_body,
                 to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
          FROM operation_audit_logs WHERE id > {int(after_id)} ORDER BY id
        ) t""")
    for r in rows:
        r["createdAt"] = parse_db_ts(r.pop("created_at"))
    return rows


def fetch_conversations(cx, since_iso):
    where = f"WHERE COALESCE(last_activity_at, \"updatedAt\") > '{since_iso}'::timestamp" if since_iso else ""
    rows = cx.psql_json(f"""
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
          SELECT id, user_id, provider, model, message_count,
                 to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                 to_char(COALESCE(last_activity_at, "updatedAt"), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_activity
          FROM ai_conversations {where}
          ORDER BY COALESCE(last_activity_at, "updatedAt")
        ) t""")
    for r in rows:
        r["createdAt"] = parse_db_ts(r.pop("created_at"))
        r["lastActivityAt"] = parse_db_ts(r.pop("last_activity"))
    return rows


def fetch_access(cx, since_dt):
    """since_dt 为 None 时取日志中全部可见访问记录。"""
    out, retention = [], None
    for line in cx.access_lines(iso(since_dt) if since_dt else None):
        m = ACCESS_RE.match(line)
        if not m:
            continue
        ts = parse_nginx_ts(m.group("ts"))
        if ts is None:
            continue
        if since_dt is not None and ts <= since_dt:
            continue  # docker logs --since 是闭区间，严格大于以去重
        parts = m.group("request").split(" ")
        raw_bytes = m.group("bytes")
        out.append({
            "ts": ts,
            "ip": m.group("ip"),
            "method": parts[0] if parts else None,
            "path": parts[1].split("?")[0] if len(parts) > 1 else None,
            "status": int(m.group("status")),
            "bytes": int(raw_bytes) if raw_bytes.isdigit() else 0,
            "ua": m.group("ua"),
        })
    if since_dt is not None:
        retention = cx.access_log_retention_start()
    return out, retention


# ── 聚合 ────────────────────────────────────────────────────────────────────

def agg_ai(rows, window):
    by_day = defaultdict(lambda: {"rows": 0, "tokens": 0, "errors": 0})
    by_action, by_model, by_provider = Counter(), Counter(), Counter()
    by_user = defaultdict(lambda: {"rows": 0, "tokens": 0, "username": None})
    intents, feedback = Counter(), Counter()
    totals = {"rows": len(rows), "promptTokens": 0, "completionTokens": 0,
              "totalTokens": 0, "errors": 0, "blocked": 0}
    for r in rows:
        pt, ct = r.get("prompt_tokens") or 0, r.get("completion_tokens") or 0
        totals["promptTokens"] += pt
        totals["completionTokens"] += ct
        totals["totalTokens"] += pt + ct
        if r.get("is_error"):
            totals["errors"] += 1
        if BLOCKED_RE.search(f"{r.get('error_message') or ''} {r.get('action') or ''}"):
            totals["blocked"] += 1
        dt = r["createdAt"]
        if dt:
            d = by_day[dt.strftime("%Y-%m-%d")]
            d["rows"] += 1
            d["tokens"] += pt + ct
            if r.get("is_error"):
                d["errors"] += 1
        by_action[r.get("action") or "(none)"] += 1
        by_model[r.get("model") or "(none)"] += 1
        by_provider[r.get("provider") or "(none)"] += 1
        u = by_user[r.get("user_id") or "(none)"]
        u["rows"] += 1
        u["tokens"] += pt + ct
        u["username"] = u["username"] or r.get("username")
        if r.get("business_intent"):
            intents[r["business_intent"]] += 1
        if r.get("feedback"):
            feedback[r["feedback"]] += 1
    top_users = sorted(
        ({"userId": k, "username": v["username"], "rows": v["rows"], "tokens": v["tokens"]}
         for k, v in by_user.items()), key=lambda x: -x["rows"])
    return {
        "window": window,
        "totals": totals,
        "byDay": [{"date": k, **by_day[k]} for k in sorted(by_day)],
        "byAction": dict(by_action.most_common()),
        "byModel": dict(by_model.most_common()),
        "byProvider": dict(by_provider.most_common()),
        "byUser": top_users,
        "topIntents": [{"intent": k, "count": v} for k, v in intents.most_common(20)],
        "feedback": dict(feedback),
    }


def agg_access(rows, window):
    by_status, by_method, by_hour = Counter(), Counter(), Counter()
    paths, ips = defaultdict(lambda: {"requests": 0, "errors": 0}), Counter()
    totals = {"requests": len(rows), "bytes": 0, "errorRequests": 0}
    for r in rows:
        totals["bytes"] += r["bytes"]
        by_status[str(r["status"])] += 1
        by_method[r["method"] or "?"] += 1
        by_hour[r["ts"].strftime("%Y-%m-%dT%H")] += 1
        p = paths[r["path"] or "?"]
        p["requests"] += 1
        if r["status"] >= 400:
            p["errors"] += 1
            totals["errorRequests"] += 1
        ips[r["ip"]] += 1
    totals["distinctIps"] = len(ips)
    totals["errorRate"] = round(totals["errorRequests"] / len(rows), 4) if rows else 0
    return {
        "window": window,
        "totals": totals,
        "byStatusClass": dict(Counter(f"{s[0]}xx" for s in by_status).most_common()),
        "byStatus": dict(by_status.most_common()),
        "byMethod": dict(by_method.most_common()),
        "byHour": [{"hour": k, "requests": by_hour[k]} for k in sorted(by_hour)],
        "topPaths": sorted(({"path": k, **v} for k, v in paths.items()),
                           key=lambda x: -x["requests"])[:30],
        "topIps": [{"ip": k, "requests": v} for k, v in ips.most_common(30)],
    }


def agg_operations(rows, window):
    by_action, by_user, paths = Counter(), Counter(), Counter()
    totals = {"rows": len(rows), "logins": 0, "writes": 0, "failed": 0}
    for r in rows:
        by_action[r.get("action") or "unknown"] += 1
        by_user[r.get("user_id") or "unknown"] += 1
        paths[r.get("path") or "?"] += 1
        if r.get("action") == "LOGIN":
            totals["logins"] += 1
        else:
            totals["writes"] += 1
        if (r.get("status_code") or 0) >= 400:
            totals["failed"] += 1
    return {
        "window": window,
        "totals": totals,
        "byAction": dict(by_action.most_common()),
        "byUser": [{"userId": k, "count": v} for k, v in by_user.most_common()],
        "topPaths": [{"path": k, "count": v} for k, v in paths.most_common(20)],
    }


# ── 落盘 ────────────────────────────────────────────────────────────────────

def write_json(path, obj):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=2, default=str)


def write_jsonl_gz(path, rows):
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False, default=str) + "\n")


def render_summary(meta, ai, access, ops, conv_count):
    t, a = ai["totals"], access["totals"]
    win_from = meta["windows"]["aiAudit"].get("from") or meta["windows"]["access"].get("from")
    win_to = meta["windows"]["aiAudit"].get("to") or meta["windows"]["access"].get("to")
    lines = [
        f"# Demo 用量归档 {meta['archiveId']}",
        "",
        f"- 归档时刻：{meta['archivedAt']}",
        f"- 数据窗口：{win_from or '（无数据）'} → {win_to or '（无数据）'}",
        f"- {'⚠ 首次运行，已归档当前可得的全部历史' if meta['firstRun'] else '增量归档'}",
        f"- 数据源：AI 审计 #{meta['watermarksAfter']['aiAuditLogId']} 之前累计；"
        f"访问日志最早可得 {meta['windows']['access'].get('from') or '—'}",
        "",
        "## AI 使用",
        "",
        f"- 审计行 {t['rows']}；对话 {ai['byAction'].get('chat', 0)}；工具调用 {ai['byAction'].get('tool_call', 0)}",
        f"- Token：prompt {t['promptTokens']} + completion {t['completionTokens']} = **{t['totalTokens']}**",
        f"- 错误 {t['errors']}；阻断/拒绝 {t['blocked']}；涉及用户 {len(ai['byUser'])} 人",
    ]
    if ai["byModel"]:
        lines.append(f"- 模型分布：{', '.join(f'{k}×{v}' for k, v in list(ai['byModel'].items())[:5])}")
    if ai["topIntents"]:
        top_intents = ", ".join("{}×{}".format(i["intent"], i["count"]) for i in ai["topIntents"][:5])
        lines.append(f"- Top 意图：{top_intents}")
    lines += [
        "",
        "## 系统访问",
        "",
        f"- 请求 {a['requests']}；去重 IP {a['distinctIps']}；错误 {a['errorRequests']}（{a['errorRate']:.1%}）",
        f"- 状态码：{', '.join(f'{k}×{v}' for k, v in list(access['byStatus'].items())[:6])}",
    ]
    if access["topPaths"]:
        lines.append("- Top 路径：")
        lines += [f"  - `{p['path']}` ×{p['requests']}" + (f"（错误 {p['errors']}）" if p["errors"] else "")
                  for p in access["topPaths"][:8]]
    if access["topIps"]:
        top_ips = ", ".join("{}×{}".format(i["ip"], i["requests"]) for i in access["topIps"][:8])
        lines.append(f"- Top IP：{top_ips}")
    lines += [
        "",
        "## 登录与写操作",
        "",
        f"- 共 {ops['totals']['rows']} 条；登录 {ops['totals']['logins']}；写操作 {ops['totals']['writes']}；失败 {ops['totals']['failed']}",
        f"- 按动作：{', '.join(f'{k}×{v}' for k, v in ops['byAction'].items())}",
        f"- 对话元数据留档 {conv_count} 条（重置会清空该表）",
        "",
    ]
    if meta.get("gaps"):
        lines += ["## ⚠ 数据缺口（如实记录，未伪造覆盖）", ""]
        for g in meta["gaps"]:
            lines.append(f"- {g['source']}：{g['from']} → {g['to']} 缺失（{g['reason']}）")
        lines.append("")
    lines += ["## 口径说明", ""] + [f"- {n}" for n in meta["notes"]] + [""]
    return "\n".join(lines)


def prune(out_dir, keep):
    dirs = sorted((d for d in os.listdir(out_dir)
                   if os.path.isdir(os.path.join(out_dir, d)) and not d.startswith(".")), reverse=True)
    removed = []
    for d in dirs[keep:]:
        shutil.rmtree(os.path.join(out_dir, d), ignore_errors=True)
        removed.append(d)
    return removed


def main():
    ap = argparse.ArgumentParser(description="KeelBase Demo 用量归档（初始化前留存访问与 AI 使用情况）")
    ap.add_argument("--compose-dir", default="/opt/keelbase", help="docker compose 项目目录")
    ap.add_argument("--env-file", default=None, help="含 POSTGRES_USER/POSTGRES_DB 的 env 文件")
    ap.add_argument("--out", default=None, help="归档输出目录")
    ap.add_argument("--keep", type=int, default=3, help="保留最近 N 份（默认 3）")
    args = ap.parse_args()

    compose_dir = os.path.abspath(args.compose_dir)
    env_file = args.env_file or os.path.join(compose_dir, "Server-NestJS", ".env.production")
    out_dir = os.path.abspath(args.out or os.path.join(compose_dir, "usage-archive"))
    state_path = os.path.join(out_dir, STATE_FILE)

    os.makedirs(out_dir, exist_ok=True)
    state = {}
    if os.path.isfile(state_path):
        with open(state_path, "r", encoding="utf-8") as fh:
            state = json.load(fh)
    wm = state.get("watermarks", {})
    first_run = not wm
    ai_wm = int(wm.get("aiAuditLogId", 0))
    op_wm = int(wm.get("operationAuditLogId", 0))
    conv_since = wm.get("conversationsSince")
    access_since_raw = wm.get("accessSince")
    access_since = parse_db_ts(access_since_raw)
    if conv_since and not re.match(r"^\d{4}-\d{2}-\d{2}T[\d:.]+Z$", conv_since):
        sys.exit(f"✗ .state.json 中 conversationsSince 非法：{conv_since}")
    if access_since_raw and not re.match(r"^\d{4}-\d{2}-\d{2}T[\d:.]+Z$", access_since_raw):
        sys.exit(f"✗ .state.json 中 accessSince 非法：{access_since_raw}")

    cx = Compose(compose_dir, env_file)
    log(f"→ 归档窗口起点：AI#{ai_wm} / OP#{op_wm} / 访问 {access_since_raw or '（首次，全量）'}")

    ai_rows = fetch_ai_audit(cx, ai_wm)
    op_rows = fetch_operation_audit(cx, op_wm)
    conv_rows = fetch_conversations(cx, conv_since)
    access_rows, retention_start = fetch_access(cx, access_since)
    log(f"  取到：AI {len(ai_rows)} 行 / 操作 {len(op_rows)} 行 / 对话 {len(conv_rows)} 条 / 访问 {len(access_rows)} 行")

    gaps = []
    if access_since and retention_start and retention_start > access_since:
        gaps.append({
            "source": "nginx-access",
            "from": iso(access_since),
            "to": iso(retention_start),
            "reason": "web 容器日志已轮转/容器重建，该区间访问日志不可得",
        })
        log(f"  ⚠ 访问日志缺口 {iso(access_since)} → {iso(retention_start)}")

    archived_at = utc_now_iso()
    archive_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    ai_window = {"from": iso(ai_rows[0]["createdAt"]) if ai_rows else None,
                 "to": iso(ai_rows[-1]["createdAt"]) if ai_rows else None}
    op_window = {"from": iso(op_rows[0]["createdAt"]) if op_rows else None,
                 "to": iso(op_rows[-1]["createdAt"]) if op_rows else None}
    access_window = {"from": iso(access_rows[0]["ts"]) if access_rows else None,
                     "to": iso(access_rows[-1]["ts"]) if access_rows else None,
                     "requestedSince": access_since_raw,
                     "logRetentionStart": iso(retention_start)}
    conv_window = {"from": iso(conv_rows[0]["lastActivityAt"]) if conv_rows else None,
                   "to": iso(conv_rows[-1]["lastActivityAt"]) if conv_rows else None,
                   "requestedSince": conv_since}

    ai_agg = agg_ai(ai_rows, ai_window)
    access_agg = agg_access(access_rows, access_window)
    ops_agg = agg_operations(op_rows, op_window)

    conv_ts = ([parse_db_ts(conv_since)] if conv_since else []) \
        + [r["lastActivityAt"] for r in conv_rows if r["lastActivityAt"]]
    access_ts = ([access_since] if access_since else []) + [r["ts"] for r in access_rows]

    new_wm = {
        "aiAuditLogId": max([ai_wm] + [r["id"] for r in ai_rows]),
        "operationAuditLogId": max([op_wm] + [r["id"] for r in op_rows]),
        "conversationsSince": iso(max(conv_ts)) if conv_ts else None,
        "accessSince": iso(max(access_ts)) if access_ts else None,
    }

    meta = {
        "format": FORMAT,
        "archiveId": archive_id,
        "archivedAt": archived_at,
        "firstRun": first_run,
        "sources": {
            "aiAudit": "ai_audit_logs", "operations": "operation_audit_logs",
            "conversations": "ai_conversations", "access": "nginx access log (docker json-file)",
        },
        "windows": {"aiAudit": ai_window, "operations": op_window,
                    "conversations": conv_window, "access": access_window},
        "watermarksBefore": wm,
        "watermarksAfter": new_wm,
        "counts": {"aiAudit": len(ai_rows), "operations": len(op_rows),
                   "conversations": len(conv_rows), "access": len(access_rows)},
        "gaps": gaps,
        "notes": [
            "按日聚合一律使用 UTC 日界（与 ai_audit_logs 在线统计口径一致）。",
            "ai_daily_usage 未纳入：demo 环境上该表为 0 行（配额预留路径未生效）。",
            "「阻断/拒绝」判定沿用在线端点 getActionReport 的同一正则，避免同一规则出现第二个实现。",
            "ai_conversations 为元数据（不含消息正文）；该表会被 reset-test-data.js TRUNCATE，故单独留档。",
            "未纳入 ai_messages 正文（按归档口径约定）。",
        ],
    }

    tmp_dir = os.path.join(out_dir, f".tmp-{archive_id}")
    final_dir = os.path.join(out_dir, archive_id)
    shutil.rmtree(tmp_dir, ignore_errors=True)
    os.makedirs(tmp_dir)
    write_json(os.path.join(tmp_dir, "meta.json"), meta)
    write_json(os.path.join(tmp_dir, "ai-usage.json"), ai_agg)
    write_jsonl_gz(os.path.join(tmp_dir, "ai-usage.jsonl.gz"), ai_rows)
    write_json(os.path.join(tmp_dir, "access.json"), access_agg)
    write_jsonl_gz(os.path.join(tmp_dir, "access.jsonl.gz"), access_rows)
    write_json(os.path.join(tmp_dir, "operations.json"), ops_agg)
    write_jsonl_gz(os.path.join(tmp_dir, "conversations.jsonl.gz"), conv_rows)
    with open(os.path.join(tmp_dir, "SUMMARY.md"), "w", encoding="utf-8") as fh:
        fh.write(render_summary(meta, ai_agg, access_agg, ops_agg, len(conv_rows)))
    os.replace(tmp_dir, final_dir)

    # 水位只在成功落盘后推进
    write_json(state_path, {"watermarks": new_wm, "lastArchiveId": archive_id, "updatedAt": archived_at})

    removed = prune(out_dir, max(1, args.keep))
    log(f"✓ 归档完成：{final_dir}")
    log(f"  AI {ai_agg['totals']['rows']} 行 / {ai_agg['totals']['totalTokens']} token；"
        f"访问 {access_agg['totals']['requests']} 请求 / {access_agg['totals']['distinctIps']} IP")
    if removed:
        log(f"  已清理超出 {args.keep} 份的旧归档：{', '.join(removed)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 — 顶层兜底：非零退出，水位不推进，下次重试
        print(f"ARCHIVE_FAILED {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
