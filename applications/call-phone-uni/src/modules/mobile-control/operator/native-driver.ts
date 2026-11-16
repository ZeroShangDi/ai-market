import {operatorExecute,operatorReady} from '@/uni_modules/portable-operator';
const fail=(code:string)=>Object.assign(new Error(code),{code});
/** Only local native calls. Nothing here opens a socket or enables accessibility. */
export class NativeDriver {
 readonly capabilities=['observe','click','longClick','setText','swipe','scroll','back','home','recentApps','launchApp','screenshot','pressKey','drag'];
 available(){return operatorReady();}
 private call(payload:unknown):Promise<any>{
  if(!operatorReady())return Promise.reject(fail('ACCESSIBILITY_UNAVAILABLE'));
  return new Promise((resolve,reject)=>{
   operatorExecute(JSON.stringify(payload),(value:string)=>{
    try{resolve(JSON.parse(value));}catch{reject(fail('EXECUTION_UNCONFIRMED'));}
   });
  });
 }
 async observe({signal}:{signal?:AbortSignal}={}){
  if(signal?.aborted)throw fail('CANCELLED');
  const result=await this.call({action:{operation:'observe',arguments:{}}});
  if(result.status!=='completed'||!result.data)throw fail(result.error?.code||'EXECUTION_UNCONFIRMED');
  return result.data;
 }
 async perform(action:any,{signal,snapshot,resolved,gesture}:any={}){
  if(signal?.aborted)throw fail('CANCELLED');
  // Once native dispatch starts, await its real result even if JS receives cancellation.
  if(!gesture&&action.operation==='swipe')gesture=[{...resolved.from.point,timeMs:0},{...resolved.to.point,timeMs:action.arguments.durationMs??600}];
  return this.call({action,...(snapshot?{snapshotId:snapshot.snapshotId}:{}),resolved,...(gesture?{gesture}:{})});
 }
}
