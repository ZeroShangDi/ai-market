const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../shared/proxy-origin.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject,URL});
test('proxy accepts exact local/tailnet origins and preserves foreign or malformed Origin headers',()=>{
 const fn=exportsObject.sameOriginHost;assert(fn('http://127.0.0.1:5194','127.0.0.1:5194'));assert(fn('https://device.ts.net:8443','device.ts.net:8443'));
 for(const origin of ['https://evil.example','null','http://name@127.0.0.1:5194','http://127.0.0.1:5194/path','http://127.0.0.1:5194/','http://127.0.0.1:5192'])assert.equal(fn(origin,'127.0.0.1:5194'),false,origin);
});
