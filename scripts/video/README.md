# KeelBase 自动录制脚本

`record-demo.mjs` 会启动本机 Chrome/Edge，自动执行 Golden Demo 流程（登录 -> CRM -> AI Copilot -> 写操作确认 -> 治理轨迹），并通过 OBS WebSocket 控制 OBS 开始/停止录制。

## 使用

```bash
# 完整录制
node scripts/video/record-demo.mjs

# 只检查 OBS 场景 / 窗口 / 捕获源
node scripts/video/record-demo.mjs --obs-info
```

## 前置条件

- 本地服务已启动：`http://localhost:3000`
- OBS 已运行，WebSocket 服务器已开启（默认端口 4455）
- 本机安装 Chrome 或 Edge
- 已配置 DeepSeek / Qwen / OpenAI key（演示需要真实 LLM 才能触发工具确认）

脚本会自动读取 OBS 本地配置中的 WebSocket 密码，无需手动输入；也可以通过 `OBS_WS_PASSWORD` 覆盖。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BASE_URL` | `http://localhost:3000` | 本地应用地址 |
| `OBS_WS_URL` | `ws://localhost:4455` | OBS WebSocket 地址 |
| `OBS_WS_PASSWORD` | 自动读取 | OBS WebSocket 密码 |
| `DEMO_USER` / `DEMO_PASSWORD` | `alex` / `Alex@2026$Demo` | 演示账号 |
| `DEMO_QUESTION` | 创建跟进任务指令 | 发给 AI 的提问 |
| `CHROME_PATH` | 自动探测 | Chrome/Edge 可执行文件路径 |
| `VIDEO_OUT` | `artifacts/demo` | Playwright 兜底视频目录 |

## 产物

- OBS 录制：OBS 配置的录制目录（本项目默认 `docs/videos`），MP4
- Playwright 兜底：`artifacts/demo/*.webm`

如果当前 OBS 场景没有捕获源，脚本会尝试创建窗口捕获；若捕获源配置失败，请手动在 OBS 中把浏览器窗口加入当前场景后再录制。

## 完整系统巡游

```bash
node scripts/video/record-demo.mjs --full
```

会按顺序录制：普通用户工作台（首页 / 事件 / 待办 / 通知 / 组织 / CRM / 项目管理 / 审批 / AI 轨迹）-> AI CRM 写操作确认闭环 -> 切换管理员 -> 控制台（概览 / 用户 / 组织 / 事件 / 知识库 / 通知 / 监控 / 运维 / AI 审计 / 操作审计 / 会话 / 统计 / AI 工具 / AI 审批 / 安全审查 / 风险中心 / MCP / 策略 / Agent / 系统 AI / 系统信息）。
