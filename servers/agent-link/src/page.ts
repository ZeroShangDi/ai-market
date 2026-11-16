function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * 桌面端配对页：显示二维码、6 位配对码、已绑定设备与解绑按钮。
 * 页面只依赖同源 HTTP 接口，不加载任何外部资源。
 */
export interface PairPageOptions {
  agentName: string;
  code: string;
  expiresAt: number;
  qr: string;
  payload: string;
  pageKey: string;
  baseUrl: string;
}

export function renderPairPage({ agentName, code, expiresAt, qr, payload, pageKey, baseUrl }: PairPageOptions): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>配对 ${esc(agentName)} · Agent Link</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f2f4f8;color:#1a1f2e;font:15px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
  .card{width:min(460px,92vw);background:#fff;border-radius:22px;padding:28px 28px 22px;box-shadow:0 18px 50px rgba(20,31,51,.12)}
  .brand{display:flex;align-items:center;gap:10px;font-weight:600;font-size:17px}
  .dot{width:9px;height:9px;border-radius:50%;background:#12b76a}
  h1{font-size:21px;margin:16px 0 4px}
  p.sub{margin:0;color:#7b8598;font-size:13px}
  .qr{margin:20px auto 14px;width:280px;height:280px;padding:10px;border:1px solid #e9edf4;border-radius:18px;background:#fff}
  .qr svg{width:100%;height:100%;display:block}
  .code{text-align:center;font-size:13px;color:#5d6a80;margin-bottom:6px}
  .code b{display:inline-block;margin-left:6px;font-size:20px;letter-spacing:6px;color:#1a1f2e}
  .url{word-break:break-all;text-align:center;color:#98a2b3;font-size:11px;margin:8px 0 16px}
  .status{display:flex;align-items:center;gap:8px;padding:12px 14px;border-radius:12px;background:#f5f7fb;font-size:13px;color:#5d6a80}
  .status .dot{background:#f79009}
  .status.ok .dot{background:#12b76a}
  .device{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding:12px 14px;border:1px solid #e9edf4;border-radius:12px;font-size:13px}
  button{border:0;border-radius:10px;padding:9px 14px;background:#294fdb;color:#fff;font-size:13px;cursor:pointer}
  button.ghost{background:#f2f4f8;color:#5d6a80}
  button.danger{background:#fff1f0;color:#d92d20}
  .actions{display:flex;justify-content:space-between;gap:10px;margin-top:16px}
  .linkbox{margin-top:12px;font-size:12px;color:#7b8598}
  .linkbox summary{cursor:pointer}
  .linkbox code{display:block;word-break:break-all;background:#f5f7fb;border-radius:8px;padding:8px;margin:8px 0;color:#5d6a80}
  .linkbox button{float:right;margin-top:-2px}
  .hint{margin-top:14px;color:#98a2b3;font-size:11px;line-height:1.6}
</style>
</head>
<body>
  <main class="card">
    <div class="brand"><span class="dot"></span><span>Agent Link</span></div>
    <h1>连接手机与 ${esc(agentName)}</h1>
    <p class="sub">在手机 App「Agent 消息」点右上角 +，选择扫码，扫描下方二维码。</p>
    <div class="qr">${qr}</div>
    <div class="code">配对码<b>${esc(code)}</b></div>
    <div class="url">${esc(baseUrl)}</div>
    <div class="status" id="status"><span class="dot"></span><span id="statusText">等待手机扫码…</span></div>
    <details class="linkbox"><summary>扫码没反应？复制配对链接</summary><code>${esc(payload)}</code><button class="ghost" id="copy">复制</button></details>
    <div id="device"></div>
    <div class="actions">
      <button class="ghost" id="refresh">刷新二维码</button>
      <button class="danger" id="unbind" hidden>解绑手机</button>
    </div>
    <p class="hint">二维码 5 分钟内有效，只能绑定一台手机；重新扫码会覆盖旧绑定。手机与电脑需在同一局域网。</p>
  </main>
<script>
  const key = ${JSON.stringify(pageKey)};
  const expiresAt = ${Number(expiresAt)};
  const statusEl = document.getElementById('status');
  const textEl = document.getElementById('statusText');
  const deviceEl = document.getElementById('device');
  const unbindEl = document.getElementById('unbind');

  async function poll() {
    try {
      const r = await fetch('/api/pair/status?key=' + encodeURIComponent(key), { cache: 'no-store' });
      if (!r.ok) throw new Error('status');
      const data = await r.json();
      if (data.paired) {
        statusEl.classList.add('ok');
        textEl.textContent = '已连接';
        deviceEl.innerHTML = '';
        const row = document.createElement('div');
        row.className = 'device';
        const name = document.createElement('span');
        name.textContent = data.device && data.device.name ? data.device.name : '手机';
        row.appendChild(name);
        deviceEl.appendChild(row);
        unbindEl.hidden = false;
      } else {
        statusEl.classList.remove('ok');
        textEl.textContent = Date.now() > expiresAt ? '二维码已过期，请刷新' : '等待手机扫码…';
      }
    } catch {
      textEl.textContent = '本机服务暂时不可用';
    }
  }

  document.getElementById('refresh').addEventListener('click', async () => {
    await fetch('/api/pair/new', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
    location.reload();
  });

  unbindEl.addEventListener('click', async () => {
    await fetch('/api/pair/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
    location.reload();
  });

  document.getElementById('copy').addEventListener('click', async () => {
    const text = ${JSON.stringify(payload)};
    try { await navigator.clipboard.writeText(text); } catch { /* 非安全上下文时退化为选中 */ }
    textEl.textContent = '配对链接已复制，可粘贴到手机 App';
  });

  poll();
  setInterval(poll, 2000);
</script>
</body>
</html>`;
}
