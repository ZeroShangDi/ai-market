const {test}=require('node:test');const assert=require('node:assert/strict');
const base='../src/modules/mobile-control/';
const state=()=>({snapshotId:'one',foregroundPackage:'com.test',appVersion:'1.2.3',display:{width:400,height:800},nodes:[{nodeRef:'n:0',resourceId:'com.test:id/button',role:'Button',text:'Go',bounds:{left:10,top:10,right:100,bottom:100},visible:true,enabled:true,clickable:true,editable:true,scrollable:true}]});
const click=()=>({operation:'click',arguments:{expectedPackage:'com.test',target:{match:{resourceId:'com.test:id/button'}}}});
async function setup(){const {Operator}=await import(base+'operator/index.mjs');let current=state(),calls=[];const driver={capabilities:['observe','click','setText','swipe','drag','scroll','back'],observe:async()=>current,perform:async(a,c)=>{calls.push({a,c});return {status:'completed',verified:true};}};return {operator:new Operator(driver),driver,calls,current};}
test('Operator rejects metadata and ambiguous, stale, invisible, offscreen and password targets before dispatch',async()=>{
 const {operator,calls,current}=await setup();
 assert.equal((await operator.execute({...click(),deviceId:'phone'})).error.code,'INVALID_ARGUMENT');
 current.nodes.push({...current.nodes[0],nodeRef:'n:1'});assert.equal((await operator.execute(click())).error.code,'TARGET_AMBIGUOUS');current.nodes.pop();
 assert.equal((await operator.execute({operation:'click',arguments:{expectedPackage:'com.test',target:{snapshotId:'old',nodeRef:'n:0'}}})).error.code,'STALE_SNAPSHOT');
 current.nodes[0].visible=false;assert.equal((await operator.execute(click())).error.code,'TARGET_NOT_ACTIONABLE');current.nodes[0].visible=true;
 assert.equal((await operator.execute({operation:'click',arguments:{expectedPackage:'com.test',target:{point:{x:400,y:0}}}})).error.code,'OUT_OF_BOUNDS');
 current.nodes[0].password=true;current.nodes[0].text='hidden';assert.equal((await operator.execute({operation:'observe',arguments:{}})).data.nodes[0].text,'');
 assert.equal((await operator.execute({operation:'setText',arguments:{expectedPackage:'com.test',target:{match:{resourceId:'com.test:id/button'}},text:'new'}})).error.code,'PASSWORD_TARGET');assert.equal(calls.length,0);
});
test('native completion is not business verification; an exception after dispatch is unknown and never retried',async()=>{
 const {operator,driver,calls}=await setup();assert.deepEqual(await operator.execute(click()),{status:'completed',verified:false});
 driver.perform=async()=>{calls.push('failed');throw Error('private native content');};
 const r=await operator.execute(click());assert.equal(r.status,'unknown');assert.equal(r.error.code,'EXECUTION_UNCONFIRMED');assert.equal(calls.length,2);assert.ok(!JSON.stringify(r).includes('private'));
});
test('phone Runtime serializes actions and produces bounded swipe geometry through the same Operator',async()=>{
 const {Runtime}=await import(base+'runtime/index.mjs');const {operator,driver,calls}=await setup();let active=0,max=0;
 const perform=driver.perform;driver.perform=async(...args)=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));const out=await perform(...args);active--;return out;};
 const runtime=new Runtime(operator,{minIntervalMs:0});
 try{await Promise.all([runtime.execute(click()),runtime.execute({operation:'swipe',arguments:{expectedPackage:'com.test',from:{point:{x:100,y:600}},to:{point:{x:100,y:100}},durationMs:500}})]);assert.equal(max,1);assert.equal(calls[1].c.gesture.length,25);assert.ok(calls[1].c.gesture.every(p=>p.x>=0&&p.x<400&&p.y>=0&&p.y<800));}finally{await runtime.close();}
});
test('waitFor polls conditions, rejects ambiguity and does not call mutation',async()=>{
 const {Runtime}=await import(base+'runtime/index.mjs');const {operator,current,calls}=await setup();const runtime=new Runtime(operator,{minIntervalMs:0});
 try{assert.equal((await runtime.waitFor({type:'visible',match:{text:'Go'}},{timeoutMs:0})).status,'completed');assert.equal((await runtime.waitFor({type:'absent',match:{text:'Go'}},{timeoutMs:0})).error.code,'WAIT_TIMEOUT');current.nodes.push({...current.nodes[0],nodeRef:'n:1'});assert.equal((await runtime.waitFor({type:'visible',match:{text:'Go'}})).error.code,'TARGET_AMBIGUOUS');assert.equal(calls.length,0);}finally{await runtime.close();}
});
test('App functions are discovered by version and always re-enter runtime and Operator',async()=>{
 const {Runtime,AppFunctions}=await import(base+'runtime/index.mjs');const {operator,current,calls}=await setup();const functions=new AppFunctions();functions.register({id:'example',packageName:'com.test',versionRange:'^1.2.0',functions:{go:ctx=>ctx.execute(click())}});const runtime=new Runtime(operator,{minIntervalMs:0,functions});
 try{assert.equal(runtime.discoverApps('com.test','1.2.3').length,1);assert.equal((await runtime.invokeApp({id:'example',functionName:'go',packageName:'com.test',version:'1.2.3',args:{}})).status,'completed');assert.equal(calls.length,1);current.appVersion='2.0.0';assert.equal((await runtime.invokeApp({id:'example',functionName:'go',packageName:'com.test',version:'1.2.3',args:{}})).error.code,'APP_FUNCTION_UNAVAILABLE');assert.equal(calls.length,1);}finally{await runtime.close();}
});
test('runtime calls separate the tool-like wrapper from the pure action and reject transport metadata',async()=>{
 const {dispatchRuntimeCall}=await import(base+'runtime/calls.mjs');const {Runtime}=await import(base+'runtime/index.mjs');const {operator,calls}=await setup();const runtime=new Runtime(operator,{minIntervalMs:0});
 try{
 assert.equal((await dispatchRuntimeCall(runtime,{operation:'action',action:click(),requestId:'wire-id'})).error.code,'INVALID_ARGUMENT');
 assert.equal((await dispatchRuntimeCall(runtime,{operation:'action',action:click()})).status,'completed');assert.deepEqual(calls[0].a,click());
 assert.equal((await dispatchRuntimeCall(runtime,{operation:'invoke',action:click(),id:'bad',functionName:'go',packageName:'com.test',version:'1.0.0',args:{}})).error.code,'INVALID_ARGUMENT');
 }finally{await runtime.close();}
});
test('wait timeout remains bounded while rate quota is exhausted; cancelled queued input never executes',async()=>{
 const {Runtime}=await import(base+'runtime/index.mjs');const {operator,calls}=await setup();const runtime=new Runtime(operator,{minIntervalMs:0,maxPerMinute:1});
 try{
 await runtime.execute({operation:'observe',arguments:{}});
 const started=Date.now();const result=await runtime.waitFor({type:'visible',match:{text:'Go'}},{timeoutMs:40});assert.equal(result.error.code,'WAIT_TIMEOUT');assert.ok(Date.now()-started<1000);
 const abort=new AbortController();const pending=runtime.execute(click(),{signal:abort.signal});abort.abort();assert.equal((await pending).error.code,'CANCELLED');assert.equal(calls.length,0);
 }finally{await runtime.close();}
});
test('in-flight native action keeps the device queue until completion despite cancellation',async()=>{
 const {Runtime}=await import(base+'runtime/index.mjs');const {operator,driver}=await setup();let release,entered;const entry=new Promise(r=>entered=r);
 driver.perform=async()=>{entered();await new Promise(r=>release=r);return {status:'completed'};};const runtime=new Runtime(operator,{minIntervalMs:0});const abort=new AbortController();
 try{let settled=false;const pending=runtime.execute(click(),{signal:abort.signal}).then(v=>{settled=true;return v;});await entry;abort.abort();await new Promise(r=>setTimeout(r,10));assert.equal(settled,false);release();assert.equal((await pending).status,'completed');}finally{await runtime.close();}
});
test('runtime pause, resume and stop are explicit lifecycle controls',async()=>{
 const {Runtime}=await import(base+'runtime/index.mjs');const {operator,calls}=await setup();const runtime=new Runtime(operator,{minIntervalMs:0});
 try{assert.equal(runtime.pause().status,'paused');assert.equal((await runtime.execute(click())).error.code,'PAUSED');assert.equal(runtime.resume().status,'resumed');assert.equal((await runtime.execute(click())).status,'completed');assert.equal(runtime.stop().status,'stopped');assert.equal((await runtime.execute(click())).error.code,'RUNTIME_CLOSED');assert.equal(calls.length,1);}finally{await runtime.close();}
});
