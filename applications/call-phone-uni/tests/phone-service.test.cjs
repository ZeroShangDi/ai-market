const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
test('phone listener starts after all permissions, remains unique and excludes recording paths',()=>{
 let granted=false,observer,registered=0,removed=0;const logs=[];
 const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/phone.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,exports={};
 const mocks={vue:{reactive:x=>x},'@/native/phone':{phoneCapability:{available:()=>true,observe:fn=>{observer=fn;registered++;return ()=>removed++;}}},'@/modules/device-readiness':{permissionGranted:()=>granted},'@/services/logger':{logger:{info:(...x)=>logs.push(x),warn(){}}}};
 vm.runInNewContext(source,{exports,require:id=>mocks[id]});assert.equal(exports.refreshPhoneObservation(),false);assert.equal(registered,0);
 granted=true;exports.refreshPhoneObservation();exports.refreshPhoneObservation();assert.equal(registered,1);
 observer({kind:'ended',durationSeconds:5,localRecordingAvailable:true,recordingPath:'/private/customer.wav'});assert.equal(exports.phoneState.durationSeconds,5);assert(!JSON.stringify(exports.phoneState).includes('/private'));assert(!JSON.stringify(logs).includes('/private'));
 granted=false;exports.refreshPhoneObservation();assert.equal(removed,1);
});
