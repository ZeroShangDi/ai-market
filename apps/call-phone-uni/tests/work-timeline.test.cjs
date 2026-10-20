const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
function load(name, mocks = {}) {
  const output = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/ui', name + '.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {exports:output, require:id => mocks[id], Date, Map, Set});
  return output;
}
const presentation = load('work-presentation');
const markdown = load('chat-markdown', {'./format': {toast() {}}});
const {workTurns} = load('work-timeline', {'./work-presentation':presentation,'./chat-markdown':markdown});
const event = (sequence, type, data, run_id = 'r') => ({sequence,type,data,run_id});
const session = (extra = {}) => ({sequence:0,messages:[{id:'r',role:'user',content:'制作报告'}],artifacts:[],...extra});
const normalize = value => JSON.parse(JSON.stringify(value));

test('partial text, steps and files keep identical IDs, content and order after interruption and refresh', () => {
  const events = [
    event(1,'text_delta',{message_id:'a',delta:'先检查资料'}),
    event(2,'assistant',{id:'envelope',message_id:'a',content:'先检查资料'}),
    event(3,'tool_start',{id:'tool',name:'Read'}),
    event(4,'tool_call',{id:'tool',name:'Read',input:{file_path:'/workspace/source.csv'}}),
    event(5,'artifact',{id:'f',name:'报告.pdf',size:100}),
    event(6,'text_delta',{message_id:'b',delta:'结论生成到一半'}),
  ];
  const s = session({sequence:6});
  const visible = workTurns(s,events)[0].items;
  assert.deepEqual(Array.from(visible, item => item.kind), ['text','step','file','text']);
  events.push(event(7,'error',{status:'interrupted'})); s.sequence = 7;
  const stopped = workTurns(s,events)[0].items;
  assert.deepEqual(Array.from(stopped, item => item.id), Array.from(visible, item => item.id));
  assert.deepEqual(Array.from(stopped.filter(item => item.kind === 'text'), item => item.content), ['先检查资料','结论生成到一半']);
  assert.deepEqual(normalize(workTurns(normalize(s),normalize(events))),normalize(workTurns(s,events)));
});

test('completion updates the same streamed message, does not move files or duplicate the final answer', () => {
  const events = [event(1,'text_delta',{message_id:'a',delta:'完成'}), event(2,'artifact',{id:'f',name:'a.pdf',size:1})];
  const s = session({sequence:2}); const before = workTurns(s,events)[0].items;
  events.push(event(3,'assistant',{id:'uuid',message_id:'a',content:'完成'}),event(4,'result',{text:'完成',success:true}));
  s.sequence = 4; s.messages.push({id:'reply',role:'assistant',run_id:'r',content:'完成'});
  s.artifacts.push({id:'f',name:'a.pdf',size:1,run_id:'r'});
  const after = workTurns(s,events)[0].items;
  assert.deepEqual(Array.from(after, item => item.id),Array.from(before,item => item.id));
  assert.equal(after[0].content,'完成'); assert.equal(after.length,2);
});

test('old envelope UUIDs reconcile to streamed text, tool-only assistant events never erase partial content', () => {
  const events = [event(1,'text_delta',{message_id:'sdk-id',delta:'说明'}),event(2,'assistant',{id:'different-uuid',content:'说明完整'}),event(3,'assistant',{id:'tool-only',content:''})];
  const items = workTurns(session(),events)[0].items;
  assert.equal(items.length,1); assert.equal(items[0].id,'text:sdk-id'); assert.equal(items[0].content,'说明完整');
});

test('queued runs retain their own text, files and source lists, including repeated URLs across replies', () => {
  const s = session({messages:[{id:'r',role:'user'},{id:'next',role:'user'}]});
  const events = [event(1,'text_delta',{message_id:'a',delta:'上海'}),event(2,'sources',{items:[{url:'https://weather.test/sh',title:'上海'},{url:'javascript:bad'}]}),event(3,'artifact',{id:'f',name:'sh.pdf',size:2}),event(4,'text_delta',{message_id:'b',delta:'北京'},'next'),event(5,'sources',{items:[{url:'https://weather.test/bj',title:'北京'},{url:'https://weather.test/sh',title:'对照上海'}]},'next')];
  const turns = workTurns(s,events);
  assert.deepEqual(Array.from(turns[0].sources, s => s.title),['上海']);
  assert.deepEqual(Array.from(turns[1].sources, s => s.title),['北京','对照上海']);
  assert.equal(turns[0].items.filter(i => i.kind === 'file').length,1);
  assert.equal(turns[1].items.filter(i => i.kind === 'file').length,0);
});

test('fresh replay immediately shows confirmed snapshot output and reconciles without duplicates', () => {
  const s = session({sequence:3,messages:[{id:'r',role:'user'},{id:'reply',role:'assistant',run_id:'r',content:'结果'}],artifacts:[{id:'f',name:'a.pdf',size:1,run_id:'r'}]});
  assert.deepEqual(Array.from(workTurns(s,[])[0].items,i => i.kind),['text','file']);
  const events = [event(1,'text_delta',{message_id:'a',delta:'过程'}),event(2,'artifact',{id:'f',name:'a.pdf',size:1}),event(3,'result',{text:'结果'})];
  assert.deepEqual(Array.from(workTurns(s,events)[0].items,i => i.kind),['text','file','text']);
});
