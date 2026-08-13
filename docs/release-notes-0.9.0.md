## KeelBase v0.9.0 — 业务安全的 AI Agent harness · 三端应用基座

KeelBase 是一个「AI 按系统约定生成、业务安全」的全栈应用基座：一套后端，Flutter App + Taro 小程序 + PC Web 管理台三端出；AI Agent 工具调用限定用户数据范围，写操作人工确认，全链路可审计。

### 三个里程碑能力

- **业务安全的 AI Agent harness**：AI 工具调用限定数据范围 + 写操作人工确认 + 副作用可撤销 + 评测闭环 + CASL 行级权限与 AI 打通
- **三端一致**：Flutter App（iOS/Android/Web）+ Taro 小程序/H5 + Vue3 管理台，一套后端三端出
- **生产级工程化**：全链路审计、敏感数据静态加密、OTel/Prometheus/Loki 可观测、CI 全绿、一键部署 + 单容器交付

### 主要功能

- **AI**：对话（非流式 + SSE 流式 + 工具过程可视化）、写操作人工确认协议、长程用户记忆、上下文压缩、子代理委托 + 技能、RAG 知识库（文档上传/向量检索）、联网搜索、多模态图片理解、AI 行为回放
- **三端**：事件日历、待办、通知中心（SSE + 推送）、全局搜索、上传、低代码表单、插件机制、模板市场、数据导入迁移
- **安全**：CASL 行级权限、JWT 轮换 + 登录锁定、邮箱/手机号验证、敏感字段 AES 静态加密、管理端数据脱敏、SSRF / OAuth 验签 / 认证枚举防护
- **运维**：GitHub Actions CI（lint / 测试 / 覆盖率 / 迁移一致性 / 三端构建）、一键部署、离线/私有化 AI（Ollama）、可观测性栈、运维健康巡检

### 快速体验

```bash
docker run -p 80:80 keelbase/keelbase:0.9.0   # 单容器全栈（镜像发布后可用）
# 或 docker compose up 起全栈后访问：
#   用户    alex / 123456
#   管理员  admin / Admin@1234（管理台 /admin）
```

### 文档与安全

- [README](https://github.com/rain6fish/KeelBase) · [CHANGELOG](CHANGELOG.md) · [SECURITY.md](SECURITY.md)（漏洞披露流程 + SBOM 生成方式）
- 完整路线图维护于私有空间（战略/安全细节不公开）
