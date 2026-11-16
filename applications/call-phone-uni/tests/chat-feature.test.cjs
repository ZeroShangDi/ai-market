const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const tick=()=>new Promise(r=>setImmediate(r));
function harness(api){
 const nodes=new Map(),events={},timers=new Map();let serial=0;
 for(const id of ['messages','form','input','send','refresh'])nodes.set('#'+id,{value:'',disabled:false,addEventListener(name,fn){this[name]=fn;}});
 const source=fs.readFileSync(path.join(__dirname,'../features/team-chat/app.js'),'utf8').replace(/^import .*?;\n/,'');
 const context={document:{hidden:false,querySelector:s=>nodes.get(s),addEventListener:(n,f)=>events[n]=f},window:{addEventListener:(n,f)=>events[n]=f},ready:async()=>({}),api,showError(){},renderMessages(){},setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(source,context);return {nodes,events,timers};
}
test('slow result synchronization does not disable typing; queued refresh runs after it',async()=>{
 let release,reads=0,sends=0;const gate=new Promise(r=>release=r);
 const h=harness(async(route,body)=>{if(route==='/chat/results'){await gate;return {messages:[]};}if(body){sends++;return {};}reads++;return {messages:[]};});
 await tick();assert.equal(h.nodes.get('#send').disabled,false);
 h.nodes.get('#input').value='task';await h.nodes.get('#form').submit({preventDefault(){}});assert.equal(sends,1);
 h.events['transcript-saved']();release();await tick();await tick();assert(reads>=2);
 h.events.pagehide();assert.equal(h.timers.size,0);
});
test('unknown send is never automatically replayed by background refresh',async()=>{
 let sends=0;const h=harness(async(route,body)=>{if(route==='/chat/results')return {messages:[]};if(body){sends++;throw Error('unknown');}return {messages:[]};});
 await tick();h.nodes.get('#input').value='task';await h.nodes.get('#form').submit({preventDefault(){}});h.events['transcript-saved']();await tick();assert.equal(sends,1);h.events.pagehide();
});
