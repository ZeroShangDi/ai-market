import SHA256 from 'crypto-js/sha256.js';
const fail=code=>Object.assign(new Error(code),{code});
export function normalizePortalState(value){
 const state=typeof value==='string'?JSON.parse(value):value;
 if(!state?.phone_state?.packageName||!state.a11y_tree)throw fail('INVALID_SNAPSHOT');
 const nodes=[];const walk=(node,path)=>{
  if(!node||typeof node!=='object')throw fail('INVALID_SNAPSHOT');
  const b=node.boundsInScreen;
  if(!b||!['left','top','right','bottom'].every(k=>Number.isFinite(b[k])))throw fail('INVALID_SNAPSHOT');
  nodes.push({nodeRef:'n:'+path,resourceId:node.resourceId||'',role:node.className||'',text:node.isPassword?'':node.text||'',description:node.isPassword?'':node.contentDescription||'',bounds:{left:b.left,top:b.top,right:b.right,bottom:b.bottom},clickable:node.isClickable===true,enabled:node.isEnabled===true,visible:node.isVisibleToUser===true});
  for(const [i,child]of (node.children||[]).entries())walk(child,path+'.'+i);
 };
 const roots=Array.isArray(state.a11y_tree)?state.a11y_tree:[state.a11y_tree];roots.forEach((n,i)=>walk(n,String(i)));
 if(!nodes.length)throw fail('EMPTY_SNAPSHOT');
 const data={foregroundPackage:state.phone_state.packageName,nodes};
 return {...data,snapshotId:SHA256(JSON.stringify(data)).toString()};
}
/** Adapter for DeviceRuntime. No application-specific workflow belongs here. */
export class StandardController {
 constructor(transport){this.transport=transport;}
 async execute(request,{signal}={}){
  if(request.operation==='observe')return normalizePortalState(await this.transport.observe({signal}));
  if(['back','home','launchApp'].includes(request.operation)){if(request.arguments?.expectedPackage){const before=normalizePortalState(await this.transport.observe({signal}));if(before.foregroundPackage!==request.arguments.expectedPackage)throw fail('STALE_SNAPSHOT');}return this.transport.dispatch(request.operation,request.arguments,{signal});}
  if(request.operation!=='click')throw fail('UNSUPPORTED');
  const snapshot=normalizePortalState(await this.transport.observe({signal})),args=request.arguments;
  if(snapshot.snapshotId!==args?.snapshotId||snapshot.foregroundPackage!==args.expectedPackage)throw fail('STALE_SNAPSHOT');
  const node=snapshot.nodes.find(n=>n.nodeRef===args.nodeRef);if(!node)throw fail('TARGET_NOT_FOUND');
  const b=node.bounds;if(!node.clickable||!node.enabled||!node.visible||b.right<=b.left||b.bottom<=b.top)throw fail('TARGET_NOT_ACTIONABLE');
  return this.transport.dispatch('tap',{x:Math.round((b.left+b.right)/2),y:Math.round((b.top+b.bottom)/2)},{signal});
 }
}
