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
  const docs = workFileCategories[0].accept, sheets = workFileCategories[1].accept;
  for (const name of ['合同.DOCX', '资料.pdf', '说明.txt', '讲稿.pptx']) assert.equal(acceptsWorkFile(name, docs), true);
  for (const name of ['数据.xlsx', '数据.CSV', '数据.tsv']) assert.equal(acceptsWorkFile(name, sheets), true);
  for (const name of ['视频.mp4', '照片.png', '旧文件.doc', '旧数据.xls', '伪装.xlsx.exe']) assert.equal(acceptsWorkFile(name, docs + ',' + sheets), false);
  assert.equal(acceptsWorkFile('any.exe', ''), false);
  assert.notEqual(fileAppearance('数据.xlsx').color, fileAppearance('说明.docx').color);
});
