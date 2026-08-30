/* KeelBase 官方 Demo 分镜渲染（外置脚本：作为 'self' 资源放行后端 CSP script-src 'self'） */
const SLIDES = {
  1: { kicker: 'KeelBase', html: 'AI 已经不只是聊天。', cls: 'sub' },
  2: { kicker: 'Golden Path', html: 'AI → read customer data<br>→ analyze risk<br>→ create follow-up task<br>→ update CRM', cls: 'sub' },
  3: { kicker: '0:09', html: '<span class="big" style="color:#dc2626">WAIT.</span><br><span class="sub">Can the AI really do that?</span>', cls: '' },
  4: { kicker: 'Three Questions', html: "Can it access data it shouldn't see?<br><br>Can it write without approval?<br><br>If something goes wrong,<br>can we know what happened — and undo it?", cls: 'sub' },
  5: { kicker: '', html: '<div class="brand">KeelBase</div><div class="brand-sub">Business-safe AI Agent Runtime</div>', cls: '' },
  6: { kicker: 'Positioning', html: '<div class="line"><b>AI Agents</b></div><div class="line">MCP / OpenAPI / Tools</div><div class="line arrow">↓</div><div class="line"><b>KeelBase Trust Layer</b></div><div class="line arrow">↓</div><div class="line">CRM · ERP · OA · MES</div>', cls: 'sub' },
  7: { kicker: 'Trust Layer', html: '<div class="row"><span class="chip">Identity</span><span class="chip">Policy</span><span class="chip">Permission</span><span class="chip">Confirmation</span><span class="chip">Audit</span><span class="chip">Revoke</span></div>', cls: '' },
  8: { kicker: 'Brand Sentence', html: '<div class="big" style="font-size:44px">AI can act — but only within<br>explicit business boundaries.</div>', cls: '' },
  9: { kicker: 'Live · Demo 1', html: 'Login alex / Alex@2026$Demo → AI CRM', cls: 'sub' },
  10: { kicker: 'Live · Demo 1', html: 'Understanding request...<br>→ query_customer_orders<br>→ query_customer_activities<br>→ analyze_customer_risk', cls: 'sub' },
  11: { kicker: 'Live · Demo 1', html: '3 customers need attention<br><span class="accent">HanYu Manufacturing · Risk: Critical</span><br>¥2.8M order overdue 40 days', cls: 'sub' },
  12: { kicker: 'Live · Demo 2', html: 'AI suggests creating a follow-up task for HanYu Manufacturing. Execute?', cls: 'sub' },
  13: { kicker: 'Live · Demo 2', html: 'Create Follow-up Task<br>Customer: HanYu Manufacturing · Owner: Alex<br>[ Reject ] [ Approve ]', cls: 'sub' },
  14: { kicker: 'Live · Demo 2', html: 'Click Approve', cls: 'sub' },
  15: { kicker: 'Live · Demo 3', html: '<span class="ok">✓ Permission checked</span><br><span class="ok">✓ Human approval received</span><br><span class="ok">✓ Task created</span>', cls: 'sub' },
  16: { kicker: 'Live · Demo 3', html: 'New task in CRM Tasks<br>Advance HanYu Manufacturing phase agreement signing', cls: 'sub' },
  17: { kicker: 'Live · Demo 4', html: 'User Request → AI Decision → Tool Call<br>→ Authorization → Human Approval<br>→ Database Mutation → Audit Record', cls: 'sub' },
  18: { kicker: 'Live · Demo 4', html: 'SHA-256 Hash Chain<br><span class="ok">✓ Integrity Verified</span>', cls: 'sub' },
  19: { kicker: 'Live · Demo 5', html: 'Revoke AI-created task?<br>[ Cancel ] [ Revoke ]', cls: 'sub' },
  20: { kicker: 'Live · Demo 5', html: '<span class="ok">✓ Side effect revoked</span>', cls: 'sub' },
  21: { kicker: 'Live · Demo 5', html: 'Read → Decide → Confirm → Act → Audit → Revoke', cls: 'sub' },
  22: { kicker: 'Trust Runtime', html: '<div class="line"><b>Any AI Agent</b></div><div class="line arrow">↓ Tool / MCP / API</div><div class="line"><b>KeelBase Trust Layer</b></div><div class="line" style="font-size:18px">Identity · Policy · Authorization · Human Approval · Side-effect · Audit · Revoke · Evaluation</div><div class="line arrow">↓</div><div class="line">Any Business System</div>', cls: 'sub' },
  23: { kicker: 'Brand', html: '<div class="big" style="font-size:42px">Not another Agent Framework.</div><div class="sub" style="margin-top:16px;color:#d97706">A Trust Runtime for Business AI.</div>', cls: '' },
  24: { kicker: 'Live · Overreach', html: 'User: view customer orders owned by another sales rep', cls: 'sub' },
  25: { kicker: 'Live · Overreach', html: '<div class="big" style="font-size:40px;color:#dc2626">ACCESS DENIED</div><div class="sub" style="font-size:18px">User scope: Owner = Alex<br>Requested resource: Customer owned by Bob<br>Policy: ROW-LEVEL DENY</div>', cls: '' },
  26: { kicker: 'Enterprise Safety Validation', html: '<span class="ok">✓</span> 39-case Authorization Matrix<br><span class="ok">✓</span> 12/12 Security Evaluation<br><span class="ok">✓</span> Golden Flow E2E<br><span class="ok">✓</span> Audit Integrity Verification<br><span class="ok">✓</span> 15/15 Agent Behavior Benchmark', cls: 'sub' },
  27: { kicker: '', html: 'Security boundary ≠ Prompt instruction<br><div style="color:#d97706;font-weight:700;font-size:30px;margin-top:14px">Runtime enforcement</div>', cls: 'sub' },
  28: { kicker: 'Build', html: '<code style="font-size:30px;background:rgba(15,23,42,0.06);padding:12px 28px;border-radius:10px;color:#1d4ed8">keelbase init --desc "Customer management"</code>', cls: '' },
  29: { kicker: 'Build', html: 'Natural Language → Module Spec<br>→ Application Protocol → Application Code<br>→ AI Tools → Governance', cls: 'sub' },
  30: { kicker: 'Build', html: '<div class="big" style="font-size:40px">Protocol → Code</div><div class="sub">Your application. Your source code.</div>', cls: '' },
  31: { kicker: 'Build', html: '<div class="big" style="font-size:44px">Protocol → Code</div>', cls: '' },
  32: { kicker: 'Existing System', html: '<div class="line">Existing CRM / ERP / 10-year-old Java System / Existing Database</div><div class="line arrow">↓ Bridge</div><div class="line">Application Protocol</div><div class="line arrow">↓ KeelBase Trust Runtime</div><div class="line arrow">↓ AI Agent</div>', cls: 'sub' },
  33: { kicker: 'Existing System', html: '<div class="big" style="font-size:42px">Legacy system, new AI capability.</div>', cls: '' },
  34: { kicker: 'Private Deploy', html: '<div class="line">Cloud LLM <b>OR</b> Local Model / Ollama</div><div class="line arrow">→ Local Embedding</div><div class="line arrow">→ Local RAG</div><div class="line arrow">→ Business-safe Agent</div><div class="line arrow">→ Local Audit</div>', cls: 'sub' },
  35: { kicker: 'Private Deploy', html: '<div class="row"><span class="chip">Docker</span><span class="chip">Offline</span><span class="chip">On-Premise</span><span class="chip">Private Data</span></div>', cls: '' },
  36: { kicker: '', html: '', cls: '' },
  37: { kicker: '', html: '<div class="brand">KeelBase</div><div class="brand-sub" style="font-size:22px">Build → Run → Trust → Private Deploy</div><div class="sub" style="font-size:20px;margin-top:18px">Business-safe AI Applications</div><div class="sub" style="font-size:20px;margin-top:8px">AI can act — but only within explicit business boundaries.</div><div class="footer">Open Source · Enterprise AI Trust Runtime<br>github.com/rain6fish/KeelBase</div>', cls: '' },
};

const shot = Number(new URLSearchParams(location.search).get('shot')) || 1;
const data = SLIDES[shot] || { kicker: 'KeelBase', html: 'Loading…', cls: 'sub' };
document.getElementById('slide').innerHTML =
  '<div class="fade">' +
  (data.kicker ? '<div class="kicker">' + data.kicker + '</div>' : '') +
  '<div class="' + data.cls + '">' + data.html + '</div>' +
  '</div>';
