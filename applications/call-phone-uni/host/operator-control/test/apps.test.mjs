import{test}from'node:test';import assert from'node:assert/strict';import{AppAdapters}from'../src/apps.mjs';
test('app functions are version scoped and execute through the same generic controller',async()=>{
 const registry=new AppAdapters(),calls=[];registry.register({id:'example',packageName:'com.example',versionRange:'^1.0.0',functions:{async inspect(ctx){await ctx.act('click',{snapshotId:'s',nodeRef:'n'});return 'done';}}});
 assert.equal(registry.discover('com.example','2.0.0').length,0);assert.equal(registry.discover('com.example','invalid').length,0);
 const execute=async(op,args)=>{calls.push({op,args});return {foregroundPackage:'com.example'};};
 assert.equal(await registry.invoke({id:'example',functionName:'inspect',packageName:'com.example',version:'1.2.0',args:{},execute}),'done');assert.deepEqual(calls.map(c=>c.op),['observe','click']);assert.equal(calls[1].args.expectedPackage,'com.example');
 await assert.rejects(registry.invoke({id:'example',functionName:'inspect',packageName:'com.example',version:'2.0.0',execute}),{code:'APP_ADAPTER_UNAVAILABLE'});
});
