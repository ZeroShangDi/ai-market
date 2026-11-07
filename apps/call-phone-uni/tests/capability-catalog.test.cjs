const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const moduleExports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/ui/capability-catalog.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:moduleExports});
const plugin={id:'example',name:'示例',description:'描述',installed:true,enabled:true,connected:false,connection:{label:'账号',description:'连接说明'},skills:[{id:'inspect',name:'检查',description:'检查内容',enabled:true}],tools:[{id:'inspect',label:'检查内容'}]};
test('all capability kinds share truthful parent installation and connection states',()=>{
 const entries=moduleExports.capabilityEntries([plugin]);assert.equal(entries.length,4);
 assert.equal(new Set(entries.map(e=>e.key)).size,4);
 for(const e of entries){assert.equal(e.installed,true);assert.equal(e.enabled,true);assert.equal(e.hasConnection,e.type!=='skills');assert.ok(e.name);assert.ok(e.description);}
 const absent=moduleExports.capabilityEntries([{...plugin,installed:false}]);assert.ok(absent.every(e=>!e.installed&&!e.enabled));
 const disabled=moduleExports.capabilityEntries([{...plugin,enabled:false}]);assert.ok(disabled.every(e=>!e.enabled));
});
test('disabled skill does not invent disabled tools, and local-only capabilities have no connection state',()=>{
 const entries=moduleExports.capabilityEntries([{...plugin,connection:{},skills:[{...plugin.skills[0],enabled:false}]}]);
 assert.equal(entries.length,3);assert.ok(entries.every(e=>!e.hasConnection));
 assert.equal(entries.find(e=>e.type==='skills').enabled,false);assert.equal(entries.find(e=>e.type==='mcp').enabled,true);
});
test('bundled skills, MCP and connections remain in plugin details rather than duplicate catalog roots', () => {
 const entries=moduleExports.capabilityEntries([plugin]);
 assert.equal(entries.filter(e=>!e.parentId).length,1);
 assert.equal(entries.filter(e=>e.parentId===plugin.id).length,3);
});

test('standalone skills own one catalog entry and never inherit account or connection UI',()=>{
 const entries=moduleExports.capabilityEntries([{...plugin,catalogType:'skills'}]);
 assert.equal(entries.length,1);assert.equal(entries[0].type,'skills');assert.equal(entries[0].parentId,undefined);assert.equal(entries[0].hasConnection,false);
 assert.equal(moduleExports.capabilityTags(entries[0]).length,2);
 assert.ok(moduleExports.capabilityTags(entries[0]).every(t=>!t.text.includes('连接')));
});
test('status colors distinguish disabled, ready and enabled without connection',()=>{
 const entries=moduleExports.capabilityEntries([plugin]);
 assert.equal(moduleExports.capabilityTags(entries[0]).find(t=>t.text==='待连接').tone,'pending');
 const connection=entries.find(e=>e.type==='connections');
 assert.equal(moduleExports.capabilityTags(connection).length,1);
 assert.equal(moduleExports.capabilityTags(connection)[0].tone,'off');
 const connected=moduleExports.capabilityEntries([{...plugin,connected:true}])[0];
 assert.ok(moduleExports.capabilityTags(connected).every(t=>t.tone==='on'));
 const disabled=moduleExports.capabilityEntries([{...plugin,enabled:false}])[0];
 assert.equal(moduleExports.capabilityTags(disabled).find(t=>t.text==='未启用').tone,'off');
});
