const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file){const out={};const filename=path.resolve(__dirname,file);vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:out,require:id=>load(path.relative(__dirname,path.resolve(path.dirname(filename),id+'.ts')))});return out;}
const {initialConnection}=load('../src/modules/connection.ts');
test('deployed unified origin overrides saved local and empty addresses on upgrade',()=>{
 for(const old of ['','http://127.0.0.1:48090','http://100.64.0.1:48090']){
 const value=initialConnection('https://mobile.example.com/',{baseUrl:old,tenantId:'2'},'', '1');
 assert.equal(value.baseUrl,'https://mobile.example.com');assert.equal(value.tenantId,'2');
 }
});
test('development preserves same-origin and legacy settings, corrupt storage falls back safely',()=>{
 assert.equal(initialConnection(undefined,null,'','1').baseUrl,'');
 assert.equal(initialConnection(undefined,null,'https://legacy.example.com','1').baseUrl,'https://legacy.example.com');
 const value=initialConnection('https://mobile.example.com',{baseUrl:'garbage',tenantId:'bad'},'', '1');
 assert.equal(value.baseUrl,'https://mobile.example.com');assert.equal(value.tenantId,'1');
});
