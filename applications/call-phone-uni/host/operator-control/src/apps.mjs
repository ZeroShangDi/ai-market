import semver from 'semver';
const fail=code=>Object.assign(new Error(code),{code});
const allowed=new Set(['click','longClick','setText','scroll','wait','back']);
/** Registry of trusted installed adapter modules; never evaluates source supplied by a request. */
export class AppAdapters {
 constructor(){this.items=new Map();}
 register({id,packageName,versionRange,functions}){
  if(!/^[a-z][a-z0-9-]{0,63}$/.test(id)||this.items.has(id)||!/^\w+(\.\w+)+$/.test(packageName)||!semver.validRange(versionRange)||!functions||Object.entries(functions).some(([name,fn])=>!/^\w+$/.test(name)||typeof fn!=='function'))throw fail('INVALID_APP_ADAPTER');
  this.items.set(id,{id,packageName,versionRange,functions:Object.freeze({...functions})});
 }
 discover(packageName,version){if(!semver.valid(version))return [];return [...this.items.values()].filter(item=>item.packageName===packageName&&semver.satisfies(version,item.versionRange)).map(item=>({id:item.id,packageName:item.packageName,versionRange:item.versionRange,functions:Object.keys(item.functions)}));}
 async invoke({id,functionName,packageName,version,args,execute}){
  const item=this.items.get(id);if(!this.discover(packageName,version).some(a=>a.id===id)||!Object.hasOwn(item.functions,functionName))throw fail('APP_ADAPTER_UNAVAILABLE');
  const observe=()=>execute('observe',{});
  const before=await observe();if(before.foregroundPackage!==packageName)throw fail('WRONG_APPLICATION');
  const context=Object.freeze({observe,act:(operation,params={})=>{
   if(!allowed.has(operation))throw fail('UNSUPPORTED');
   if(params.expectedPackage&&params.expectedPackage!==packageName)throw fail('WRONG_APPLICATION');
   return execute(operation,{...params,expectedPackage:packageName});
  }});
  return item.functions[functionName](context,structuredClone(args));
 }
}
