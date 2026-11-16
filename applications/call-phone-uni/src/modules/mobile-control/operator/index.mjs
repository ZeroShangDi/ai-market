import {actionCopy,error,operations} from './actions.mjs';
export {operations};
export function resolveTarget(snapshot,target,{editable=false,clickable=false,scrollable=false,longClickable=false}={}){
 if(target.point){
  const {x,y}=target.point,w=snapshot.display?.width,h=snapshot.display?.height;
  if(!Number.isInteger(w)||!Number.isInteger(h)||x<0||y<0||x>=w||y>=h)throw error('OUT_OF_BOUNDS');
  if(editable||scrollable)throw error('NODE_REQUIRED');
  return {point:{x,y}};
 }
 let nodes;
 if(target.nodeRef){
  if(target.snapshotId!==snapshot.snapshotId)throw error('STALE_SNAPSHOT');
  nodes=snapshot.nodes.filter(n=>n.nodeRef===target.nodeRef);
 }else nodes=snapshot.nodes.filter(n=>Object.entries(target.match).every(([k,v])=>n[k]===v));
 if(!nodes.length)throw error('TARGET_NOT_FOUND');
 if(nodes.length!==1)throw error('TARGET_AMBIGUOUS');
 const node=nodes[0],b=node.bounds,w=snapshot.display?.width,h=snapshot.display?.height;
 if(!node.visible||!node.enabled||!b||![b.left,b.top,b.right,b.bottom].every(Number.isFinite)||b.right<=b.left||b.bottom<=b.top)throw error('TARGET_NOT_ACTIONABLE');
 if(longClickable&&!node.longClickable||clickable&&!node.clickable||editable&&!node.editable||scrollable&&!node.scrollable){
  if(clickable||longClickable){
   const parts=node.nodeRef.split('.');
   for(let i=parts.length-1;i>1;i--){const parentRef=parts.slice(0,i).join('.');const parent=snapshot.nodes.find(candidate=>candidate.nodeRef===parentRef);if(parent?.visible&&parent.enabled&&(clickable?parent.clickable:parent.longClickable)){const pb=parent.bounds;return {nodeRef:parent.nodeRef,bounds:{...pb},point:{x:Math.round((pb.left+pb.right)/2),y:Math.round((pb.top+pb.bottom)/2)},via:'ancestor'};}}
  }
  throw error('TARGET_NOT_ACTIONABLE');
 }
 const point={x:Math.round((b.left+b.right)/2),y:Math.round((b.top+b.bottom)/2)};
 if(!Number.isInteger(w)||!Number.isInteger(h)||point.x<0||point.y<0||point.x>=w||point.y>=h)throw error('OUT_OF_BOUNDS');
 return {nodeRef:node.nodeRef,bounds:{...b},point};
}
const known=new Set(['INVALID_ARGUMENT','ACCESSIBILITY_UNAVAILABLE','UNSUPPORTED','CANCELLED','STALE_SNAPSHOT','WRONG_APPLICATION','TARGET_NOT_FOUND','TARGET_AMBIGUOUS','TARGET_NOT_ACTIONABLE','OUT_OF_BOUNDS','NODE_REQUIRED','NATIVE_REJECTED','INVALID_SNAPSHOT','PASSWORD_TARGET']);
/** App-local primitive executor. Driver owns native completion, never business success. */
export class Operator {
 constructor(driver){this.driver=driver;}
 async execute(input,{signal,gesture}={}){
  let started=false;
  try{
   const action=actionCopy(input),{operation,arguments:args}=action;
   if(signal?.aborted)throw error('CANCELLED');
   if(!this.driver?.capabilities?.includes(operation))throw error('UNSUPPORTED');
   if(operation==='observe')return {status:'completed',verified:false,data:await this.#observe(signal)};
   if(operation==='screenshot'){started=true;return this.#receipt(await this.driver.perform(action,{signal}));}
   let snapshot,resolved={};
   if(args.expectedPackage||args.target||args.from){
    snapshot=await this.#observe(signal);
    if(args.expectedPackage&&snapshot.foregroundPackage!==args.expectedPackage)throw error('WRONG_APPLICATION');
   }
   if(args.target){resolved.target=resolveTarget(snapshot,args.target,{clickable:operation==='click',longClickable:operation==='longClick',editable:operation==='setText',scrollable:operation==='scroll'});
    if(operation==='setText'&&snapshot.nodes.find(n=>n.nodeRef===resolved.target.nodeRef)?.password)throw error('PASSWORD_TARGET');
   }
   if(args.from){resolved.from=resolveTarget(snapshot,args.from);resolved.to=resolveTarget(snapshot,args.to);}
   if(signal?.aborted)throw error('CANCELLED');
   started=true;
   return this.#receipt(await this.driver.perform(action,{signal,snapshot,resolved,gesture:gesture?.({snapshot,resolved,action})}));
  }catch(e){return {status:started?'unknown':'failed',verified:false,error:{code:known.has(e.code)?e.code:'EXECUTION_UNCONFIRMED'}};}
 }
 async #observe(signal){
  const s=await this.driver.observe({signal});
  if(!s||typeof s.snapshotId!=='string'||!s.snapshotId||typeof s.foregroundPackage!=='string'||!Array.isArray(s.nodes)||s.nodes.some(n=>!n||typeof n.nodeRef!=='string'))throw error('INVALID_SNAPSHOT');
  // Password content never crosses the Operator boundary.
  return {...s,nodes:s.nodes.map(n=>n.password?{...n,text:'',description:''}:n)};
 }
 #receipt(value){
  if(!value||!['completed','dispatched','failed','unknown'].includes(value.status))return {status:'unknown',verified:false,error:{code:'INVALID_NATIVE_RECEIPT'}};
  return {...value,verified:false};
 }
}
