const fail=code=>Object.assign(new Error(code),{code});
/** API adapter for independently installed Mobilerun Portal; no copied AGPL implementation. */
export class PortalTransport {
 constructor({url,token,fetcher=fetch,timeoutMs=10000}){
  const origin=new URL(url);
  if(origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||!(origin.protocol==='https:'||origin.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(origin.hostname)))throw fail('INVALID_DEVICE_URL');
  if(typeof token!=='string'||!token.trim()||!Number.isInteger(timeoutMs)||timeoutMs<1)throw fail('INVALID_DEVICE_CONFIG');
  this.origin=origin;this.token=token;this.fetcher=fetcher;this.timeoutMs=timeoutMs;
 }
 async #request(method,params,signal){
  const response=await this.fetcher(new URL(method,this.origin),{method:params===undefined?'GET':'POST',redirect:'error',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},...(params===undefined?{}:{body:JSON.stringify(params)}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(this.timeoutMs)]):AbortSignal.timeout(this.timeoutMs)});
  if(!response.ok)throw fail('DEVICE_UNAVAILABLE');const value=await response.json();if(value.status!=='success')throw fail('DEVICE_REJECTED');return value.result;
 }
 observe({signal}={}){return this.#request('state_full?filter=true',undefined,signal);}
 async dispatch(action,params={},options={}){
  const methods={back:['global',{action:1}],home:['global',{action:2}],launchApp:['app',{package:params.packageName}],tap:['tap',{x:params.x,y:params.y}],swipe:['swipe',{startX:params.startX,startY:params.startY,endX:params.endX,endY:params.endY,duration:params.duration}]};
  if(!methods[action])throw fail('UNSUPPORTED');
  if(action==='launchApp'&&!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(params.packageName||''))throw fail('INVALID_ARGUMENT');
  if(['tap','swipe'].includes(action))for(const [name,value]of Object.entries(methods[action][1])){if(!Number.isFinite(value)||value<0||(name==='duration'&&(value<10||value>5000)))throw fail('INVALID_ARGUMENT');}
  await this.#request(methods[action][0],methods[action][1],options.signal);
  return {status:'dispatched',verified:false};
 }
}
