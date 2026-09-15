#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""语言中性合规 runner（协议 §2 审计链）——**第二语言实现**。

证明 `specs/protocol/*-vector.json`（JSON 语料）可被**非 Node** 实现消费：本脚本**独立实现**
协议 §2.2/§2.3（canonicalJSON + 链 hash + legacy 派生 + 链校验），**不 import 任何 KeelBase 源码**，
对照金样本复算即自证一致（见 docs/protocols/conformance-profile.md §2.1 Core）。

用法：python Server-NestJS/scripts/verify-protocol-conformance.py
"""
import hashlib
import hmac
import json
import os
import sys

# Windows 控制台默认 GBK，强制 UTF-8 以正确输出中文/符号（不影响算法）
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001 —— 老环境无 reconfigure 时降级
    pass

SPECS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "specs", "protocol")

# ── §2.3 canonicalJSON（语言中性规则：K 排序 + 每层键白名单 + ECMAScript 数字/JSON 转义）──

def _utf16(s: str) -> bytes:
    """键排序按 UTF-16 code unit（Java String.compareTo / JS 默认 sort 同序）。"""
    return s.encode("utf-16-be")


def js_number(x) -> str:
    """数字 → ECMAScript Number::toString（§2.3 规则 5）：短往返、-0→0、|x|>=1e21 或 <1e-6 用指数。"""
    if isinstance(x, bool):
        raise TypeError("bool 不是 number")
    if isinstance(x, int):
        return str(x)
    f = float(x)
    if f == 0:
        return "0"  # -0.0 → 0
    sign = "-" if f < 0 else ""
    f = abs(f)
    r = repr(f)  # Python repr = 最短往返（与 JS 同源算法）
    if "e" in r:
        mant, exp = r.split("e")
        e = int(exp)
    else:
        mant, e = r, 0
    ip, _, fp = mant.partition(".")
    full = ip + fp
    digits = full.lstrip("0")
    if digits == "":
        return "0"
    lead = len(full) - len(digits)
    n = e + len(ip) - lead  # 值 = digits × 10^(n - k)，k = len(digits)
    k = len(digits)
    if k <= n <= 21:
        return sign + digits + "0" * (n - k)
    if 0 < n <= 21:
        return sign + digits[:n] + "." + digits[n:]
    if -6 < n <= 0:
        return sign + "0." + "0" * (-n) + digits
    ex = n - 1
    mant_out = digits[0] + ("." + digits[1:] if k > 1 else "")
    return sign + mant_out + "e" + ("+" if ex >= 0 else "-") + str(abs(ex))


def _ser(v, kset) -> str:
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, (int, float)):
        return js_number(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)  # §2.3 规则 4：仅必需转义、非 ASCII 不转
    if isinstance(v, list):
        return "[" + ",".join(_ser(e, kset) for e in v) + "]"
    if isinstance(v, dict):
        # §2.3 规则 1：每层只输出 K 中存在的键，按 K 序（对象自身键序无关）
        return "{" + ",".join(
            json.dumps(k, ensure_ascii=False) + ":" + _ser(v[k], kset) for k in kset if k in v
        ) + "}"
    raise TypeError(f"不可序列化：{type(v)}")


def canonical_json(payload: dict) -> str:
    # JSON 语料无 undefined；K = 顶层键集（剔除 undefined 的语义在 JSON 下为空操作）
    kset = sorted(payload.keys(), key=_utf16)
    return _ser(payload, kset)


def legacy_chain_key(secret: str) -> str:
    return hmac.new(b"keelbase:audit-chain:v1", secret.encode("utf-8"), hashlib.sha256).hexdigest()


def chain_hash(key: str, prev_hash, payload: dict) -> str:
    msg = f"{prev_hash if prev_hash is not None else 'genesis'}|{canonical_json(payload)}"
    return hmac.new(key.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_chain(rows, keys, payload_for) -> dict:
    prev = None
    for i, row in enumerate(rows):
        if row.get("prevHash") != prev or not any(
            chain_hash(k, prev, payload_for(row)) == row.get("hash") for k in keys
        ):
            return {"valid": False, "checked": i, "brokenIndex": i + 1}
        prev = row.get("hash")
    return {"valid": True, "checked": len(rows)}


# ── runner ──

CASES = []


def ok(name, detail=""):
    CASES.append(True)
    print(f"  ✓ {name}" + (f" — {detail}" if detail else ""))


def bad(name, detail=""):
    CASES.append(False)
    print(f"  ✗ {name}" + (f" — {detail}" if detail else ""))


def load(name):
    with open(os.path.join(SPECS, name), encoding="utf-8") as fh:
        return json.load(fh)


def main() -> int:
    print("═══ 语言中性合规 runner（Python · 协议 §2 审计链）═══")

    print("─ canonicalJSON（§2.3）─")
    for c in load("canonical-json-v1-vector.json")["cases"]:
        got = canonical_json(c["input"])
        ok(c["name"], got) if got == c["canonicalBytes"] else bad(c["name"], f"期望 {c['canonicalBytes']}，实得 {got}")

    print("─ 审计哈希链（§2.2）─")
    for c in load("audit-hash-v1-vector.json")["cases"]:
        kind = c["kind"]
        if kind == "hex":
            got = chain_hash(c["key"], c["prevHash"], c["payload"])
            ok(c["name"], got[:16] + "…") if got == c["expectHex"] else bad(c["name"], f"实得 {got}")
        elif kind == "determinism":
            h1 = chain_hash(c["key"], c["prevHash"], c["payload"])
            h2 = chain_hash(c["key"], c["prevHash"], c["payload"])
            ok(c["name"]) if h1 == h2 and h1 == c["expectHex"] else bad(c["name"], "不一致或 ≠ 金样本")
        elif kind == "tamper":
            hA = chain_hash(c["key"], c["prevHash"], c["payloadA"])
            hB = chain_hash(c["key"], c["prevHash"], c["payloadB"])
            ok(c["name"]) if hA != hB else bad(c["name"], "篡改前后 hash 相同")
        elif kind == "genesis":
            g = chain_hash(c["key"], None, c["payload"])
            e = chain_hash(c["key"], "", c["payload"])
            ok(c["name"]) if g != e else bad(c["name"], "genesis 与空串应不同")
        elif kind == "legacy":
            got = legacy_chain_key(c["secret"])
            ok(c["name"], got[:16] + "…") if got == c["expectHex"] else bad(c["name"], f"实得 {got}")
        elif kind == "chain":
            overrides = {o["id"]: o["payload"] for o in c.get("payloadOverrides", [])}
            payload_for = lambda r: overrides.get(r["id"], r["payload"])
            got = verify_chain(c["rows"], c["keys"], payload_for)
            exp = c["expect"]
            passed = (
                got["valid"] == exp["valid"]
                and (got.get("checked") == exp.get("checked") if exp["valid"] else got.get("brokenIndex") == exp.get("brokenIndex"))
            )
            ok(c["name"], f"checked={got.get('checked')}" if exp["valid"] else f"brokenIndex={got.get('brokenIndex')}") if passed else bad(c["name"], json.dumps({"expect": exp, "got": got}))
        else:
            bad(c["name"], f"未知 kind：{kind}")

    passed, total = sum(CASES), len(CASES)
    print(f"\n═══ 结果：{passed}/{total} 通过 ═══")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
