# 存量到期行发起人边界 · 文档（2026-11-27）

- worktree `festive-kepler-429e20` / 分支 `claude/festive-kepler-429e20`，基于本地 `main` `e30aa3c1`。
- 只改文档：`docs/audit-object-search.spec.md` 的「发起人（Initiated by）」段落之后（中英各一段）新增「存量行不回填」的已知边界；选它是因为该文已是 R-8 读法（频道先于姓名）与 R-10 结果读法的唯一落点，边界必须与被它限定的读法同处，且全仓仅此文件提到 `source: automation` / `Automated`。
- 内容：本次修复之后写下的到期行读作 `Automated`；之前的存量行没有 `source`，仍读作姓名（经 AI 助手）；不回填（频道在带链的行载荷里，改写会破链）；辨别是否「确认到期」读 `action` + `outcome`，但该组合不指明写入方，导出不猜。
- 读数：`check:terminology` 0 违规；`KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all` **36/36**（75.9s）。
- 环境：本 worktree 补做了 `specs/protocol` 子模块 init 与 `Server-NestJS/node_modules` 目录联接（均未入库），否则契约类/类型类门禁会因环境缺失而红。
- 未做：不改代码、契约仓、私库；不推送、不打 tag。
