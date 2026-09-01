# Third-Party Notices / 第三方声明

SPDX-License-Identifier: Apache-2.0

> **This file is a third-party attribution notice, not the project's own license.** License expressions
> below describe *dependencies*, not KeelBase. The project's own license is Apache-2.0 — see [LICENSE](LICENSE).
>
> **本文件为第三方署名声明，非本项目自身许可。** 下文许可证表达式描述的是*依赖组件*，而非 KeelBase 本身。项目自身许可为 Apache-2.0，见 [LICENSE](LICENSE)。

KeelBase is licensed under the Apache License 2.0 (see [LICENSE](LICENSE)). This notice lists third-party
components distributed with or referenced by KeelBase, to satisfy license attribution obligations.

KeelBase 基于 Apache License 2.0 开源（见 [LICENSE](LICENSE)）。以下列出随 KeelBase 分发或引用的第三方组件，满足许可证署名义务。

## License distribution of dependencies / 依赖许可证分布

The vast majority of dependencies are permissive (MIT / Apache-2.0 / ISC / BSD / OFL) and compatible with
Apache-2.0. Notable components and their licenses:

绝大多数依赖为宽松许可证（MIT / Apache-2.0 / ISC / BSD / OFL），与 Apache-2.0 兼容。主要组件及许可证如下：

| Component / 组件 | License / 许可证 | Notes / 说明 |
|---|---|---|
| Flutter SDK & engine | BSD-3-Clause | Dart language: BSD-3-Clause |
| NestJS framework | MIT | |
| Vue.js / Element Plus | MIT | Web-Admin-Vue UI framework |
| Taro | MIT | Mini-program framework |
| RxJS / TypeORM | Apache-2.0 | |
| Dio (Dart HTTP) | MIT | |
| @fontsource / Material Design Icons | OFL-1.1 / Apache-2.0 | Open-source fonts & icons |
| Noto Sans SC (font) | OFL-1.1 | Google open-source font, bundled in Front-Flutter |

## Copyleft components (used as unmodified dependencies) / 弱 Copyleft 组件（作为未修改依赖使用）

These are used **as unmodified, independently-linked dependencies** — this does not make the project's own
code derivative of them, and they can be replaced/upgraded freely:

以下为**未修改、独立链接**的依赖使用——不构成对本项目代码的衍生，且可自由替换/升级：

- **sharp / libvips** (`@img/sharp-libvips-*`) — image processing, **LGPL-3.0-or-later** (libvips runtime
  library). sharp itself is Apache-2.0; libvips is linked as an external library, unmodified.
  **sharp / libvips**（图像处理）——libvips 运行时库为 **LGPL-3.0-or-later**；sharp 本体 Apache-2.0，libvips 作为外部库未修改地链接使用。
- **jszip** — `(MIT OR GPL-3.0-or-later)`; used under the **MIT** option.
  **jszip** ——双许可，按 **MIT** 选项使用。

## Images / media / 图片与媒体

- Flutter app icons (`Front-Flutter/android|ios/.../ic_launcher.png` etc.) are generated from the project's
  own artwork / default template assets.
  Flutter 应用图标由项目自身素材/默认模板生成。
- Demo video recordings under `artifacts/` are original recordings of the KeelBase product.
  `artifacts/` 下演示视频为本产品原创录制（不随发行版分发，位于 gitignore）。

## Full license texts / 完整许可证文本

The full text of each license is available in the corresponding dependency's own repository or `node_modules`
directory, and for the Apache-2.0 project license in [LICENSE](LICENSE).

各许可证完整文本见对应依赖仓库或 `node_modules` 目录；项目自身的 Apache-2.0 文本见 [LICENSE](LICENSE)。
