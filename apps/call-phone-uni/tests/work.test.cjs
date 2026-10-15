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
  await h.attach('1',true);assert.equal(h.state.session.messages[0].content,'完成');assert.match(h.connections[1].url,/after=0$/);h.dispose();
});
test('Work mutation uses the same key after an uncertain failure and identity reset discards late responses', async () => {
  let attempts=0;const requests=[];const late=deferred();
  const h=harness((method,url,body) => {
    if(url.endsWith('/messages')) { requests.push(body);return ++attempts===1?Promise.reject(new Error('network')):late.promise; }
    return session();
  });
  await h.attach('1',true);h.state.draft='保存文件';await h.send();const second=h.send();
  assert.equal(requests[0].request_id,requests[1].request_id);
  h.observers[0]();late.resolve(session({messages:[{id:'x',content:'旧账号数据'}]}));await second;assert.equal(h.state.session,null);assert.equal(h.state.draft,'');h.dispose();
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
