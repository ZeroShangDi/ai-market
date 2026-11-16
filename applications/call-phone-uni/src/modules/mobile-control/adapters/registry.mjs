import semver from 'semver';
import {error} from '../operator/actions.mjs';
const allowed=new Set(['observe','screenshot','click','longClick','setText','pressKey','swipe','scroll','drag','back']);
/** Trusted, installed functions only. Never accepts JS source from the Agent. */
export class AppFunctions {
 constructor(){this.items=new Map();}
 register({id,packageName,versionRange,functions}){
  if(typeof id!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(id)||this.items.has(id)||typeof packageName!=='string'||!/^\w+(\.\w+)+$/.test(packageName)||typeof versionRange!=='string'||!semver.validRange(versionRange)||!functions||!Object.keys(functions).length||Object.entries(functions).some(([name,fn])=>!/^\w+$/.test(name)||typeof fn!=='function'))throw error('INVALID_ARGUMENT');
  this.items.set(id,{id,packageName,versionRange,functions:Object.freeze({...functions})});
 }
 discover(packageName,version){if(typeof version!=='string'||!semver.valid(version))return [];return [...this.items.values()].filter(a=>a.packageName===packageName&&semver.satisfies(version,a.versionRange)).map(a=>({id:a.id,packageName:a.packageName,versionRange:a.versionRange,functions:Object.keys(a.functions)}));}
 async invoke({id,functionName,packageName,version,args},runtime,{signal}={}){
  const app=this.items.get(id);
  if(!this.discover(packageName,version).some(a=>a.id===id)||!Object.hasOwn(app.functions,functionName))throw error('APP_FUNCTION_UNAVAILABLE');
  // Version is checked again against the device, not trusted from a remote argument.
  const before=await runtime.execute({operation:'observe',arguments:{}},{signal,expectedPackage:packageName});
  if(before.status!=='completed')return before;
  if(before.data.appVersion!==version)throw error('APP_FUNCTION_UNAVAILABLE');
  const context=Object.freeze({
   execute:action=>{
    if(!allowed.has(action?.operation)||action.arguments?.expectedPackage&&action.arguments.expectedPackage!==packageName)throw error('INVALID_ARGUMENT');
    return runtime.execute(action,{signal,expectedPackage:packageName,expectedVersion:version});
   },
   waitFor:(condition,options={})=>runtime.waitFor(condition,{...options,signal,expectedPackage:packageName})
  });
  return app.functions[functionName](context,args);
 }
}
