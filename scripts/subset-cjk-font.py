#!/usr/bin/env python3

# SPDX-License-Identifier: Apache-2.0
"""生成 /mobile 打包用的中文字体子集（woff2）。

为什么要有这个脚本
------------------
Flutter web **会等 pubspec 里打包的字体加载完才跑 `main()`**，所以字体体积直接等于首帧时间。
全字形的 Noto Sans SC 是 16.4MB，在 demo 那条 ~430KB/s 的链路上要 39 秒——首帧大头。
但这份字体**不能删**：CanvasKit 的回退字体走 `fonts.gstatic.com`，大陆不可达，不打包就是豆腐块。
所以只能压体积，而压体积就必然要裁字形，于是**口径必须写下来、可复现**。

子集口径（改这里就要同步改 pubspec 注释与门禁预算）
--------------------------------------------------
1. **GB2312 全集**——6763 个汉字 + 全部 GB2312 符号/全角/假名/希腊字母/西里尔字母。
   覆盖现代简体中文书面语的绝大部分；这也是「常见字」的一个稳定、可枚举的定义（不依赖任何外部字表）。
2. **本应用自己的界面中文**——从 `Front-Flutter/lib/**/*.dart` 抽取全部非 ASCII 字符。
   这一条保证**界面文案永不缺字**，哪怕它用了 GB2312 之外的字（如生僻人名、异体字）。
3. ASCII 可打印字符 + 常用中西文标点。

**明确不包含**：GB2312 之外的生僻字（如「龑」「甯」「㸚」）、繁体专用字、日文/韩文专用字、
CJK 扩展区（B 及以上）字符。**这些在断网（大陆）环境下会显示为豆腐块**——
本脚本末尾会打印几个样本，用 `--probe` 可以自己验。

### layout features 口径（2026-09-26 实测定）

只保留横排中文/拉丁文真正用得上的：`ccmp liga calt kern mark`。

实测（源字体同、字符集同，只改这一项）：

| 保留 | 体积 |
|---|---|
| 全部（`*`） | 3.35 MiB |
| 上面 6 个默认 feature | 3.21 MiB |
| **`ccmp liga calt kern mark`（本脚本采用）** | **1.78 MiB** |
| 一个不留 | 1.74 MiB |

**省下来的几乎全是 `locl`**（单它一项就 +1.44 MiB）：它是中日韩**区域字形变体切换**，
而 Noto Sans SC 的默认字形本就是简体，我们也不切日/韩——留着纯属浪费，去掉还避免误替换。
同批去掉的还有竖排（`vert/vrt2`）、韩文音节（`ljmo/tjmo/vjmo`）、比例宽度（`palt/halt/vhal/vpal`）
与 `pwid/hwid/fwid/hist/ruby/aalt/dlig` —— 横排中文界面一个都用不到。
`kern`/`mark` 保留（体积几乎为零），拉丁文的字距与组合记号不至于退化。

代价：**拉丁文的连字与字距**会按上表退化到「只用这 5 个 feature」的程度（我们是中文界面，可接受）。

用法
----
    pip install fonttools brotli
    python scripts/subset-cjk-font.py --source <全字形 NotoSansSC-Regular.otf|woff2>

`--source` 必须是**全字形**版本。仓库里只存子集，所以要用 git 历史里那份：
    git show ee62d6f1^:Front-Flutter/assets/fonts/NotoSansSC-Regular.otf > /tmp/full.otf
（Google Fonts 也能下到 Noto Sans SC，但大陆网络通常不可达，故上面这条更实用。）

输出覆盖 `Front-Flutter/assets/fonts/NotoSansSC-Regular.woff2`。
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DART_DIR = ROOT / "Front-Flutter" / "lib"
OUT_FONT = ROOT / "Front-Flutter" / "assets" / "fonts" / "NotoSansSC-Regular.woff2"
# 门禁据此核对「界面文案没有越出子集」（见 scripts/check-mobile-preview.mjs 第五层）
OUT_COVERAGE = ROOT / "Front-Flutter" / "assets" / "fonts" / "NotoSansSC-Regular.coverage.txt"

# 保留的 layout features：横排中文/拉丁真正用得上的那几个（口径与体积见文件头说明）
KEEP_FEATURES = ["ccmp", "liga", "calt", "kern", "mark"]

# 除 GB2312 之外再补的标点/符号（有些在中西文排版里常用，但不一定落在 GB2312 里）
EXTRA_SYMBOLS = "␣—–…‘’“”·•※→←↑↓∞≈≠≤≥°±×÷§¶†‡‰′″€£¥¢©®™①-⑳"

# 用来演示缺字边界的样本（GB2312 之外，预期会显示豆腐块）
PROBE_OUTSIDE = "龑甯㸚鑫龘靐齉爨"


def gb2312_chars() -> set:
    """枚举 GB2312 能解码出的全部字符（汉字 + 符号），不依赖任何外部字表。"""
    chars = set()
    for hi in range(0xA1, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode("gb2312"))
            except UnicodeDecodeError:
                continue
    return chars


def dart_ui_chars() -> set:
    """应用自己的界面字符：Dart 源码里的全部非 ASCII 字符。"""
    chars = set()
    for path in DART_DIR.rglob("*.dart"):
        chars.update(ch for ch in path.read_text(encoding="utf-8") if ord(ch) > 127)
    return chars


def main() -> int:
    # Windows 控制台默认 GBK，打印生僻字样本会直接抛 UnicodeEncodeError
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, help="全字形源字体（.otf 或 .woff2）")
    ap.add_argument("--probe", action="store_true", help="子集后打印缺字边界样本")
    args = ap.parse_args()

    src = Path(args.source)
    if not src.exists():
        print(f"源字体不存在：{src}", file=sys.stderr)
        return 1

    from fontTools.ttLib import TTFont

    # 防呆：拿子集当源会越裁越小，且不易察觉
    src_cmap = TTFont(str(src)).getBestCmap()
    if len(src_cmap) < 15000:
        print(
            f"源字体只有 {len(src_cmap)} 个码位，看着像是**子集**而非全字形。"
            f"请换全字形源（见本文件头部说明）。",
            file=sys.stderr,
        )
        return 1

    ascii_chars = set(chr(c) for c in range(0x20, 0x7F))
    gb = gb2312_chars()
    ui = dart_ui_chars()
    chars = ascii_chars | gb | ui | set(EXTRA_SYMBOLS)

    print(f"GB2312            : {len(gb)} 字符")
    print(f"应用界面（lib/）  : {len(ui)} 字符（其中 {len(ui - gb)} 个不在 GB2312 内）")
    print(f"合计              : {len(chars)} 字符")

    from fontTools import subset

    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = KEEP_FEATURES
    opts.notdef_outline = True

    font = TTFont(str(src))
    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(text="".join(sorted(chars)))
    subsetter.subset(font)

    OUT_FONT.parent.mkdir(parents=True, exist_ok=True)
    font.save(str(OUT_FONT))

    # 覆盖清单：给门禁核对「界面文案是否越出子集」。首行是字体字节数（用于发现「换了字体没重跑」）。
    OUT_COVERAGE.write_text(
        "# 由 scripts/subset-cjk-font.py 生成，勿手改。首行=字体字节数，其余=本子集覆盖的全部字符。\n"
        f"{OUT_FONT.stat().st_size}\n"
        + "".join(sorted(chars))
        + "\n",
        encoding="utf-8",
    )

    src_mb = src.stat().st_size / 1024 / 1024
    out_mb = OUT_FONT.stat().st_size / 1024 / 1024
    print(f"\n源字体 {src_mb:.1f}MB → 子集 {out_mb:.1f}MB（{OUT_FONT.relative_to(ROOT)}）")
    print(f"覆盖清单：{OUT_COVERAGE.relative_to(ROOT)}")

    if args.probe:
        cmap = TTFont(str(OUT_FONT)).getBestCmap()
        inside = "".join(c for c in "欢迎使用全栈应用基座事件待办助手" if ord(c) in cmap)
        outside = "".join(c for c in PROBE_OUTSIDE if ord(c) not in cmap)
        print(f"  子集内（应正常）  : {inside}")
        print(f"  子集外（会豆腐）  : {outside}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
