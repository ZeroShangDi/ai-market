const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/ui/work-presentation.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: exportsObject, Date, Map });
const { workElapsed, approvalFields, workSteps } = exportsObject;
test('completed duration uses durable run timestamps, excludes other runs and does not restart on reopen', () => {
  const events = [
    { run_id: 'old', type: 'status', data: { status: 'running' }, created_at: '2026-10-15T00:00:00Z' },
    { run_id: 'r', type: 'status', data: { status: 'running' }, created_at: '2026-10-15T01:00:00Z' },
    { run_id: 'r', type: 'result', data: { success: true }, created_at: '2026-10-15T01:01:12Z' },
  ];
  assert.equal(workElapsed(events, 'r', Date.parse('2026-10-16T00:00:00Z')), '1 分 12 秒');
  assert.equal(workElapsed([], 'r'), '');
  assert.equal(workElapsed([{ run_id:'r',type:'status',data:{status:'running'},created_at:'invalid' }], 'r'), '');
});
test('approval fields preserve exact amounts and targets without inventing impact or currency', () => {
  const fields = approvalFields('mcp__finance__pay', { amount: 0, order_id: '001', _risk: 3, secret: 'never-show' });
  assert.equal(fields.find(f => f.label === '金额').value, '0');
  assert.equal(fields.find(f => f.label === '订单').value, '001');
  assert.equal(fields.find(f => f.label === '授权范围').value, '仅本次操作');
  assert.equal(fields.some(f => f.label === '币种' || f.value === 'never-show'), false);
});
test('process deduplicates streamed tool calls and distinguishes failure from completed steps', () => {
  const events = [
    {run_id:'r',type:'tool_start',data:{id:'a',name:'WebSearch'}},
    {run_id:'r',type:'tool_call',data:{id:'a',name:'WebSearch'}},
    {run_id:'r',type:'tool_result',data:{id:'a',is_error:true}},
  ];
  const steps = workSteps(events,'r'); assert.equal(steps.length,1); assert.equal(steps[0].status,'未完成');
});

test('resource categories only advertise provisioned document and table formats and reject unsupported selections', () => {
  const { workFileCategories, acceptsWorkFile, fileAppearance } = exportsObject;
  assert.deepEqual(Array.from(workFileCategories, item => item.label), ['图片', '视频', '文件']);
  assert.equal(workFileCategories[0].supported, false); assert.equal(workFileCategories[1].supported, false);
  const docs = exportsObject.supportedWorkFileExtensions, sheets = docs;
  for (const name of ['合同.DOCX', '资料.pdf', '说明.txt', '讲稿.pptx']) assert.equal(acceptsWorkFile(name, docs), true);
  for (const name of ['数据.xlsx', '数据.CSV', '数据.tsv']) assert.equal(acceptsWorkFile(name, sheets), true);
  for (const name of ['视频.mp4', '照片.png', '旧文件.doc', '旧数据.xls', '伪装.xlsx.exe']) assert.equal(acceptsWorkFile(name, docs + ',' + sheets), false);
  assert.equal(acceptsWorkFile('any.exe', ''), false);
  assert.notEqual(fileAppearance('数据.xlsx').color, fileAppearance('说明.docx').color);
});

const workItem = (id, status, hour, extra = {}) => ({ id: `work-${id}`, conversation_id: id, title: id, status, started: true, updated_at: `2026-10-16T${hour}:00:00Z`, pending: [], unread: false, sequence: 1, ...extra });
const chatItem = (id, hour) => ({ id, title: id, updated_at: `2026-10-16T${hour}:00:00Z` });
const ids = rows => Array.from(rows, row => row.id);
test('continue preview keeps three newest actionable tasks, without status priority or history filler', () => {
  const result = exportsObject.continueItems([
    workItem('approval', 'waiting', '01', { pending: ['approval'] }),
    workItem('running', 'running', '03'), workItem('failed', 'failed', '04'),
    workItem('unread', 'idle', '02', { unread: true }), workItem('done', 'idle', '06'),
  ], [chatItem('chat', '07')]);
  assert.deepEqual(ids(result.pending), ['failed', 'running', 'unread', 'approval']);
  assert.deepEqual(ids(result.preview), ['failed', 'running', 'unread']);
  assert.deepEqual(ids(result.history), ['chat', 'done']);
});
test('seen completed work leaves pending and only fills remaining preview slots in history time order', () => {
  const completed = workItem('done', 'idle', '05', { unread: true });
  const work = [workItem('running', 'running', '01'), completed];
  assert.equal(exportsObject.continueItems(work, []).pending.length, 2);
  completed.unread = false;
  const result = exportsObject.continueItems(work, [chatItem('chat', '06'), chatItem('older', '02')]);
  assert.deepEqual(ids(result.pending), ['running']);
  assert.deepEqual(ids(result.preview), ['running', 'chat', 'done']);
});
test('continue list deduplicates work and chat, ignores unstarted work and compares actual timestamps', () => {
  const result = exportsObject.continueItems([
    workItem('same', 'idle', '03'), workItem('same', 'running', '01'),
    workItem('draft', 'idle', '07', { started: false }),
    workItem('offset', 'idle', '01', { updated_at: '2026-10-16T10:00:00+08:00' }),
  ], [chatItem('same', '08'), chatItem('draft', '04'), chatItem('draft', '01')]);
  assert.deepEqual(ids(result.history), ['draft', 'same', 'offset']);
  assert.equal(result.pending.length, 0);
  assert.equal(result.history[1].work.status, 'idle');
});
test('continue preview does not fabricate minimum rows and retains interrupted work for action', () => {
  assert.equal(exportsObject.continueItems([], []).preview.length, 0);
  const result = exportsObject.continueItems([workItem('stopped', 'interrupted', '02'), workItem('closed', 'closed', '03')], []);
  assert.deepEqual(ids(result.pending), ['stopped']);
  assert.deepEqual(ids(result.preview), ['stopped', 'closed']);
});

test('generic plugin results persist after completion and stay scoped to their original run', () => {
  const { workReceipts } = exportsObject;
  const result = { title: '测试结果', summary: '处理 2 项', rows: [{ label: '项目一', status: '完成', detail: '回执 1002' }] };
  const events = [
    { sequence: 1, run_id: 'r', type: 'plugin_result', data: result },
    { sequence: 2, run_id: 'r', type: 'result', data: { success: true } },
    { sequence: 3, run_id: 'next', type: 'plugin_result', data: result },
    { sequence: 4, run_id: 'r', type: 'assistant', data: result },
  ];
  const restored = workReceipts(JSON.parse(JSON.stringify(events)), 'r');
  assert.equal(restored.length, 1); assert.equal(restored[0].rows[0].detail, '回执 1002');
});
test('plugin tool and authorization labels come from metadata without client business branches', () => {
  const fields = approvalFields('mcp__example__execute', { _display: { label: '执行示例', fields: [{ label: '范围', value: '2 项' }] } });
  assert.equal(fields[0].value, '执行示例'); assert.equal(fields[1].value, '2 项');
  assert.equal(workSteps([{ run_id: 'r', type: 'tool_call', data: { id: 'x', name: 'mcp__example__execute', label: '执行示例' } }], 'r')[0].label, '执行示例');
});
