import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPhoneLink, type PhoneLink } from '../src/index.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-link-'));
}

describe('agent-link', () => {
  let link: PhoneLink;
  let started: Awaited<ReturnType<PhoneLink['start']>>;
  let dataDir: string;
  let token: string;

  beforeEach(async () => {
    dataDir = tempDir();
    link = createPhoneLink({ dataDir, agentName: 'dsh', port: 0, host: '127.0.0.1' });
    started = await link.start();
    const payload = new URL(started.payload);
    const response = await fetch(`${started.baseUrl}/api/pair/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: payload.searchParams.get('c'),
        secret: payload.searchParams.get('s'),
        deviceName: 'test-phone'
      })
    });
    const session = await response.json();
    token = session.token;
  });

  afterEach(async () => {
    await link.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  it('手机消息入库，Agent 回复可通过长轮询取回', async () => {
    const waiting = fetch(`${started.baseUrl}/api/messages/wait?after=0&timeout=5000`, { headers: headers() });
    await new Promise((resolve) => setTimeout(resolve, 50));
    link.send('收到，我在。');
    const polled = await (await waiting).json();
    expect(polled.messages.map((m: { text: string }) => m.text)).toEqual(['收到，我在。']);

    const sent = await fetch(`${started.baseUrl}/api/messages`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ text: '你好', clientId: 'c1' })
    });
    expect(sent.status).toBe(200);
    expect(link.messagesAfter(0).filter((m) => m.direction === 'in')).toHaveLength(1);
  });

  it('审批与问题都能通过接口完成', async () => {
    const approval = link.requestApproval({ title: '运行 bash', reason: '写工作区外文件', timeoutMs: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const list = await (await fetch(`${started.baseUrl}/api/messages?after=0`, { headers: headers() })).json();
    const pending = list.messages.find((m: { type?: string }) => m.type === 'approval');
    expect(pending.status).toBe('pending');
    const decided = await fetch(`${started.baseUrl}/api/approvals/decision`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ id: pending.approvalId, decision: 'allow' })
    });
    expect(decided.status).toBe(200);
    await expect(approval).resolves.toBe('allow');

    const question = link.requestQuestion({
      title: '选择',
      questions: [{ id: 'q1', question: '选哪个', options: [{ label: 'A' }] }],
      timeoutMs: 60000
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const list2 = await (await fetch(`${started.baseUrl}/api/messages?after=0`, { headers: headers() })).json();
    const pendingQuestion = list2.messages.find((m: { type?: string }) => m.type === 'question');
    const answered = await fetch(`${started.baseUrl}/api/questions/answer`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ id: pendingQuestion.requestId, answers: [{ id: 'q1', selected: ['A'] }] })
    });
    expect(answered.status).toBe(200);
    await expect(question).resolves.toEqual({ answers: [{ id: 'q1', selected: ['A'] }] });
  });

  it('配对页需要页面 key，解绑后 token 失效', async () => {
    expect((await fetch(`http://127.0.0.1:${started.port}/pair?key=wrong`)).status).toBe(403);
    const page = await fetch(started.localUrl);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<svg');
    expect((await fetch(`${started.baseUrl}/api/unbind`, { method: 'POST', headers: headers() })).status).toBe(200);
    expect((await fetch(`${started.baseUrl}/api/messages?after=0`, { headers: headers() })).status).toBe(401);
  });
});
