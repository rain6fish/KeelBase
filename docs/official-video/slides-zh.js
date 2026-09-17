// SPDX-License-Identifier: Apache-2.0

/* KeelBase 官方 Demo 分镜渲染（中文版）——与 slides.js 同构，内容为中文 */
const SLIDES = {
  1: { kicker: 'KeelBase', html: 'AI 已经不只是聊天。', cls: 'sub' },
  2: { kicker: '黄金路径', html: 'AI → 读取客户数据<br>→ 分析风险<br>→ 创建跟进任务<br>→ 更新 CRM', cls: 'sub' },
  3: { kicker: '0:09', html: '<span class="big" style="color:#dc2626">等等。</span><br><span class="sub">AI 真的能做到这些吗？</span>', cls: '' },
  4: { kicker: '三个问题', html: "它能访问不该看的数据吗？<br><br>它能不经批准就写入吗？<br><br>如果出错，我们能知道发生了什么——并且撤销吗？", cls: 'sub' },
  5: { kicker: '', html: '<div class="brand">KeelBase</div><div class="brand-sub">业务安全 AI 运行时</div>', cls: '' },
  6: { kicker: '定位', html: '<div class="line"><strong>AI 代理</strong></div><div class="line">MCP / OpenAPI / 工具</div><div class="line arrow">↓</div><div class="line"><strong>KeelBase 治理层</strong></div><div class="line arrow">↓</div><div class="line">CRM · ERP · OA · MES</div>', cls: 'sub' },
  7: { kicker: '治理层', html: '<div class="row"><span class="chip">身份</span><span class="chip">策略</span><span class="chip">权限</span><span class="chip">确认</span><span class="chip">审计</span><span class="chip">撤销</span></div>', cls: '' },
  8: { kicker: '品牌句', html: '<div class="big" style="font-size:44px">AI 可以行动——但只在<br>明确的业务边界内。</div>', cls: '' },
  9: { kicker: '实机 · 演示 1', html: '登录 alex / Alex@2026$Demo → AI CRM', cls: 'sub' },
  10: { kicker: '实机 · 演示 1', html: '理解请求...<br>→ query_customer_orders<br>→ query_customer_activities<br>→ analyze_customer_risk', cls: 'sub' },
  11: { kicker: '实机 · 演示 1', html: '3 个客户需要关注<br><span class="accent">瀚宇制造 · 风险：严重</span><br>¥280 万订单逾期 40 天', cls: 'sub' },
  12: { kicker: '实机 · 演示 2', html: 'AI 建议为瀚宇制造创建跟进任务。执行吗？', cls: 'sub' },
  13: { kicker: '实机 · 演示 2', html: '创建跟进任务<br>客户：瀚宇制造 · 负责人：Alex<br>影响预览：受影响的动作 + 撤销口径<br>[ 拒绝 ] [ 批准 ]', cls: 'sub' },
  14: { kicker: '实机 · 演示 2', html: '点击批准', cls: 'sub' },
  15: { kicker: '实机 · 演示 3', html: '<span class="ok">✓ 权限已检查</span><br><span class="ok">✓ 已获人工批准</span><br><span class="ok">✓ 任务已创建</span>', cls: 'sub' },
  16: { kicker: '实机 · 演示 3', html: 'CRM 任务中的新任务<br>推进瀚宇制造分期方案签约', cls: 'sub' },
  17: { kicker: '实机 · 演示 4', html: '用户请求 → AI 决策 → 工具调用<br>→ 授权 → 人工批准<br>→ 数据库写入 → 审计记录', cls: 'sub' },
  18: { kicker: '实机 · 演示 4', html: 'SHA-256 哈希链<br><span class="ok">✓ 完整性已验证</span>', cls: 'sub' },
  19: { kicker: '实机 · 演示 5', html: '一次动作，写入多张表<br>项目 + 3 个任务 · 同属一个补偿组<br>[ 拒绝 ] [ 批准 ]', cls: 'sub' },
  20: { kicker: '实机 · 演示 5', html: '<span class="ok">✓ 副作用已撤销——整组写入，级联补偿</span>', cls: 'sub' },
  21: { kicker: '实机 · 演示 5', html: '读取 → 决策 → 确认 → 执行 → 审计 → 撤销', cls: 'sub' },
  22: { kicker: '治理层', html: '<div class="line"><strong>任意 AI 代理</strong></div><div class="line arrow">↓ 工具 / MCP / API</div><div class="line"><strong>KeelBase 治理层</strong></div><div class="line" style="font-size:18px">身份 · 策略 · 授权 · 人工批准 · 副作用 · 审计 · 撤销 · 评测</div><div class="line arrow">↓</div><div class="line">任意业务系统</div>', cls: 'sub' },
  23: { kicker: '品牌', html: '<div class="big" style="font-size:42px">不是又一个 Agent 框架。</div><div class="sub" style="margin-top:16px;color:#d97706">而是一个业务安全的 AI 运行时。</div>', cls: '' },
  24: { kicker: '实机 · 越权', html: '用户：查看另一位销售负责的客户订单', cls: 'sub' },
  25: { kicker: '实机 · 越权', html: '<div class="big" style="font-size:40px;color:#dc2626">访问被拒绝</div><div class="sub" style="font-size:18px">用户范围：负责人 = Alex<br>请求资源：Bob 拥有的客户<br>策略：行级拒绝</div>', cls: '' },
  26: { kicker: '实机 · 对抗沙盘', html: '现场跑一个确定性对抗场景——<br>结果 + 决策轨迹，无需调用模型', cls: 'sub' },
  27: { kicker: '', html: '安全边界 ≠ 提示词约束<br><div style="color:#d97706;font-weight:700;font-size:30px;margin-top:14px">运行时强制</div>', cls: 'sub' },
  28: { kicker: '构建', html: '业务规格 → 模块协议<br><span class="sub">一句业务诉求，确定性映射</span>', cls: 'sub' },
  29: { kicker: '构建', html: '<code style="font-size:26px;background:rgba(15,23,42,0.06);padding:12px 28px;border-radius:10px;color:#1d4ed8">node scripts/keelbase-init.mjs --spec specs/invoices.json</code>', cls: '' },
  30: { kicker: '构建', html: '<div class="big" style="font-size:40px">协议 → 代码</div><div class="sub">你的应用。你的源代码。</div>', cls: '' },
  31: { kicker: '构建', html: '<div class="big" style="font-size:44px">协议 → 代码</div>', cls: '' },
  32: { kicker: '存量系统', html: '<div class="line">现有 CRM / ERP / 十年 Java 系统 / 现有数据库</div><div class="line arrow">↓ 桥接</div><div class="line">应用协议</div><div class="line arrow">↓ KeelBase 治理层</div><div class="line arrow">↓ AI 代理</div>', cls: 'sub' },
  33: { kicker: '存量系统', html: '<div class="big" style="font-size:42px">存量系统，新的 AI 能力。</div>', cls: '' },
  34: { kicker: '私有部署', html: '<div class="line">云 LLM <strong>或</strong> 本地模型 / Ollama</div><div class="line arrow">→ 本地向量化</div><div class="line arrow">→ 本地 RAG</div><div class="line arrow">→ 业务安全代理</div><div class="line arrow">→ 本地审计</div>', cls: 'sub' },
  35: { kicker: '私有部署', html: '<div class="row"><span class="chip">Docker</span><span class="chip">离线</span><span class="chip">本地部署</span><span class="chip">私有数据</span></div>', cls: '' },
  36: { kicker: '证据', html: '一次业务动作 → 一份自包含 HTML 报告<br><span class="sub">审计方离线复核，无需安装 KeelBase</span>', cls: 'sub' },
  37: { kicker: '首次运行', html: '就绪清单：运行时 · 数据库 · AI · 治理 · 演示<br><span class="sub">每一维都自带可执行的下一步</span>', cls: 'sub' },
  38: { kicker: '', html: '', cls: '' },
  39: { kicker: '', html: '<div class="brand">KeelBase</div><div class="brand-sub" style="font-size:22px">构建 → 运行 → 信任 → 私有部署</div><div class="sub" style="font-size:20px;margin-top:18px">业务安全的 AI 应用</div><div class="sub" style="font-size:20px;margin-top:8px">AI 可以行动——但只在明确的业务边界内。</div><div class="footer">开源 · 业务安全 AI 运行时<br>github.com/rain6fish/KeelBase</div>', cls: '' },
};

const shot = Number(new URLSearchParams(location.search).get('shot')) || 1;
const data = SLIDES[shot] || { kicker: 'KeelBase', html: '加载中…', cls: 'sub' };
document.getElementById('slide').innerHTML =
  '<div class="fade">' +
  (data.kicker ? '<div class="kicker">' + data.kicker + '</div>' : '') +
  '<div class="' + data.cls + '">' + data.html + '</div>' +
  '</div>';
