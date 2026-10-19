const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), vue = require('vue');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services', file + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, require: id => mocks[id], Date, Math, setTimeout, clearTimeout, ...globals }); return exports;
}
const parser = load('ai-chat-sse');
const session = (overrides = {}) => ({ id: 's1', conversation_id: '1', status: 'idle', sequence: 0, messages: [], interactions: [], resources: [], artifacts: [], ...overrides });
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function harness(handle) {
  const calls = [], connections = [], observers = [], timers = new Map(); let serial=0;
  let snapshot = session();
  class Xhr {
    status=0; readyState=0; responseText=''; aborted=false;
    open(method,url) { this.method=method;this.url=url; }
    setRequestHeader() {} getResponseHeader() { return 'text/event-stream'; }
    send() {} abort() { this.aborted=true;this.onerror?.(); }
    chunk(event) { this.status=200;this.readyState=3;this.responseText+=`event: work\nid: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`;this.onprogress(); }
  }
  const module = load('work', { vue, './ai-chat-sse': parser, './ai-chat-preview': { previewRequestId: () => `key-${++serial}` },
    './ai-chat-remote': { xhr: () => { const x = new Xhr(); connections.push(x); return x; } },
    '@/api/http': {
      request: async (...args) => { calls.push(args); return handle ? handle(...args) : snapshot; },
      streamContext: () => ({ url: 'https://test.invalid', headers: () => ({}), current() {}, refresh: async () => {} }),
      unwrapResponse() {},
      onSessionChange: fn => { observers.push(fn);return () => {}; }, onDeviceChange: fn => { observers.push(fn);return () => {}; },
    },
  }, { setTimeout: fn => { timers.set(++serial, fn);return serial; }, clearTimeout: id => timers.delete(id) });
  return { ...module.createWorkController(), calls, connections, observers, timers, snapshot: value => { snapshot=value; } };
}
test('Work detaches observation on leave, preserves execution and replays with deduplicated cursors on return', async () => {
  const h=harness();await h.attach('1',true);const first=h.connections[0];
  first.chunk({ sequence:1,type:'text_delta',data:{delta:'你好'},run_id:'r' });
  first.chunk({ sequence:1,type:'text_delta',data:{delta:'重复'},run_id:'r' });assert.equal(h.state.liveText,'你好');
  await h.attach('1',false);assert.equal(first.aborted,true);assert.equal(h.timers.size,0);assert.equal(h.calls.some(c => /interrupt|close/.test(c[1])),false);
  h.snapshot(session({status:'idle',messages:[{id:'r',role:'assistant',content:'完成'}],sequence:3}));
  await h.attach('1',true);assert.equal(h.state.session.messages[0].content,'完成');assert.match(h.connections[1].url,/after=1$/);h.dispose();
});
test('Work mutation uses the same key after an uncertain failure and identity reset discards late responses', async () => {
  let attempts=0;const requests=[];const late=deferred();
  const h=harness((method,url,body) => {
    if(url.endsWith('/messages')) { requests.push(body);return ++attempts===1?Promise.reject(new Error('network')):late.promise; }
    return session();
  });
  await h.attach('1',true);h.state.draft='保存文件';await h.send();const second=h.send();
  assert.equal(requests[0].request_id,requests[1].request_id);
  h.observers.forEach(fn => fn());late.resolve(session({messages:[{id:'x',content:'旧账号数据'}]}));await second;assert.equal(h.state.session,null);assert.equal(h.state.draft,'');h.dispose();
});
test('Leaving during a submission releases UI lock; returning reconciles accepted request without resending', async () => {
  const pending=deferred();let accepted=false;
  const h=harness((method,url,body) => {
    if(url.endsWith('/messages')) { accepted=body.request_id;return pending.promise; }
    return session({messages:accepted?[{id:accepted,role:'user',content:'工作'}]:[]});
  });
  await h.attach('1',true);h.state.draft='工作';const send=h.send();await h.attach('1',false);assert.equal(h.state.submitting,false);
  pending.resolve(session());await send;await h.attach('1',true);assert.equal(h.state.draft,'');assert.equal(h.calls.filter(c => c[1].endsWith('/messages')).length,1);h.dispose();
});
test('Work answers and explicit interrupts use independent endpoints and exact interaction bindings', async () => {
  const h=harness();await h.attach('1',true);
  await h.answer({id:'i1',binding:'binding',kind:'approval',status:'pending',tool:'write',input:{}},{approved:false});
  const call=h.calls.find(c => c[1].endsWith('/interactions/i1'));assert.equal(call[2].binding,'binding');assert.equal(call[2].approved,false);
  await h.interrupt();assert.ok(h.calls.some(c => c[1].endsWith('/interrupt')));h.dispose();
});
test('Out-of-order Work snapshots cannot revert a newer final state', async () => {
  let n=0;const old=deferred(),latest=deferred();
  const h=harness((method,url) => url.endsWith('/s1') ? (++n===1?old.promise:latest.promise) : session());
  await h.attach('1',true);const a=h.refresh(),b=h.refresh();latest.resolve(session({status:'idle',sequence:9}));await b;old.resolve(session({status:'waiting',sequence:4}));await a;
  assert.equal(h.state.session.status,'idle');assert.equal(h.state.session.sequence,9);h.dispose();
});

test('Long streamed replies retain tool progress and a new assistant message does not concatenate the previous one', async () => {
  const h = harness(); await h.attach('1', true); const x = h.connections[0];
  x.chunk({ sequence: 1, type: 'tool_start', data: { id: 'tool', name: 'WebSearch' }, run_id: 'r' });
  for (let i = 2; i < 250; i++) x.chunk({ sequence: i, type: 'text_delta', data: { message_id: 'a', delta: '字' }, run_id: 'r' });
  x.chunk({ sequence: 250, type: 'text_delta', data: { message_id: 'b', delta: '新的过程' }, run_id: 'r' });
  assert.equal(h.state.liveText, '新的过程'); assert.equal(h.state.events[0].data.name, 'WebSearch');
  await h.markSeen(250); assert.ok(h.calls.some(c => c[1].endsWith('/seen') && c[2].sequence === 250)); h.dispose();
});

test('conversation picker only adds configured capabilities and clears account data on identity change', async () => {
  const plugin = {id:'example',name:'示例',connected:true,installed:true,enabled:true,added:false,account:'当前账号'}; let revision=0;
  const h=harness((method,url,body) => {
    if (url.endsWith('/plugins')) {
      if(method==='GET') return {items:[{...plugin}]};
      assert.equal(body.plugin_id,'example');
      if(body.action==='connect') {plugin.connected=true;plugin.account='当前账号';}
      if(body.action==='add') plugin.added=true;
      return session({sequence:++revision,plugins:[{...plugin}]});
    }
    return session();
  });
  await h.attach('1',true); await h.loadPlugins(); assert.equal(h.state.plugins[0].connected,true); assert.equal(h.state.plugins[0].added,false);
  await h.configurePlugin(plugin,'add'); assert.equal(h.state.session.plugins[0].added,true);
  h.observers.forEach(fn=>fn()); assert.equal(h.state.plugins.length,0); h.dispose();
});

test('capability management is independent of conversation and fences late account responses', async () => {
  const observers=[], calls=[], pending=deferred();
  const module=load('capabilities',{vue,'@/api/http':{
    request:async (...args)=>{calls.push(args);return pending.promise;},
    onSessionChange:fn=>observers.push(fn),onDeviceChange:fn=>observers.push(fn)
  }});
  const loading=module.loadCapabilities(); observers.forEach(fn=>fn());
  pending.resolve({items:[{id:'private',account:'old'}]}); await loading;
  assert.equal(module.capabilities.items.length,0);
  assert.equal(calls[0][1],'/api/v1/mobile/work/sessions/capabilities');
});

test('upload survives native picker hide/show, renders its resource and sends the exact associated id', async () => {
  const uploaded = deferred(), resumed = deferred(); let attaches = 0;
  const h = harness((method, url, body) => {
    if (url.endsWith('/files')) return uploaded.promise;
    if (url.endsWith('/messages')) return session({ messages: [{ id: body.request_id, role: 'user', content: body.prompt, resource_ids: body.resource_ids }], resources: [{ id: 'csv', name: '线索.csv' }] });
    if (method === 'POST' && ++attaches === 2) return resumed.promise;
    return session();
  });
  await h.attach('1', true);
  await h.attach('1', false); // Android opens its document picker.
  const upload = h.upload({ name: '线索.csv', content_base64: 'YQ==' });
  assert.equal(h.state.uploading, true);
  h.state.draft = '检查线索'; await h.send(); assert.equal(h.calls.some(c => c[1].endsWith('/messages')), false);
  const show = h.attach('1', true); // Older pre-upload snapshot arrives last.
  uploaded.resolve({ id: 'csv', name: '线索.csv' }); assert.equal(await upload, true);
  resumed.resolve(session()); await show;
  assert.equal(h.state.uploading, false); assert.equal(h.state.session.resources[0].name, '线索.csv');
  assert.equal(h.state.selected[0], 'csv');
  await h.send(); const sent = h.calls.find(c => c[1].endsWith('/messages'));
  assert.deepEqual(Array.from(sent[2].resource_ids), ['csv']);
  assert.equal(h.state.session.messages[0].resource_ids[0], 'csv'); h.dispose();
});
test('upload rejects failures and discards late attachments after conversation or identity changes', async () => {
  const late = deferred(); const h = harness((method, url) => url.endsWith('/files') ? late.promise : session());
  await h.attach('1', true); const uploading = h.upload({ name: 'a.csv', content_base64: 'YQ==' });
  h.observers.forEach(fn => fn()); late.resolve({ id: 'old' }); assert.equal(await uploading, false);
  assert.equal(h.state.selected.length, 0); assert.equal(h.state.session, null); h.dispose();
  const bad = harness((method, url) => url.endsWith('/files') ? Promise.reject(new Error('upload unavailable')) : session());
  await bad.attach('1', true); await assert.rejects(bad.upload({ name: 'a.csv', content_base64: 'YQ==' }), /upload unavailable/);
  assert.equal(bad.state.uploading, false); assert.equal(bad.state.selected.length, 0); bad.dispose();
});

test('Work accepts queued sends while running and preserves text typed during submission', async () => {
  const accepted = deferred(); let body;
  const h = harness((method, url, input) => {
    if (url.endsWith('/messages')) { body = input; return accepted.promise; }
    return session({ status: 'running', run_id: 'first' });
  });
  await h.attach('1', true); h.state.draft = '补充条件'; const sending = h.send();
  assert.equal(body.enqueue, true); h.state.draft = '下一条';
  accepted.resolve(session({ status: 'running', run_id: 'first', sequence: 2, messages: [{ id: body.request_id, role: 'user', content: body.prompt, delivery: 'queued' }] }));
  await sending; assert.equal(h.state.draft, '下一条'); assert.equal(h.state.session.messages[0].delivery, 'queued'); h.dispose();
});

test('A previous turn result refresh never clears text streaming for the next queued turn', async () => {
  const late = deferred(); let reads = 0;
  const h = harness((method, url) => {
    if (url.endsWith('/s1')) return ++reads === 1 ? late.promise : session({ status: 'running', run_id: 'next', sequence: 2 });
    return session({ status: 'running', run_id: 'first' });
  });
  await h.attach('1', true); const x = h.connections[0];
  x.chunk({ sequence: 1, type: 'result', data: { success: true }, run_id: 'first' });
  x.chunk({ sequence: 2, type: 'status', data: { status: 'running' }, run_id: 'next' });
  x.chunk({ sequence: 3, type: 'text_delta', data: { message_id: 'next-response', delta: '正在继续' }, run_id: 'next' });
  late.resolve(session({ status: 'running', run_id: 'next', sequence: 2 }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state.liveText, '正在继续'); h.dispose();
});


test('terminal refresh and reattachment retain all partial text events and resume without replay duplicates', async () => {
  const h = harness(); await h.attach('1', true); const x = h.connections[0];
  const events = [
    {sequence:1,type:'text_delta',run_id:'r',data:{message_id:'a',delta:'已经写到这里'}},
    {sequence:2,type:'artifact',run_id:'r',data:{id:'f',name:'report.pdf',size:12}},
    {sequence:3,type:'error',run_id:'r',data:{message:'已中断'}},
  ];
  for (const event of events) x.chunk(event);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state.events[0].data.delta, '已经写到这里');
  const retained = JSON.stringify(h.state.events);
  await h.attach('1', false); await h.attach('1', true);
  assert.equal(JSON.stringify(h.state.events), retained);
  assert.match(h.connections[1].url, /after=3$/);
  h.connections[1].chunk(events[0]); assert.equal(JSON.stringify(h.state.events), retained);
  h.dispose();
  const fresh = harness(); await fresh.attach('1', true);
  for (const event of events) fresh.connections[0].chunk(event);
  assert.equal(JSON.stringify(fresh.state.events), retained); fresh.dispose();
});
