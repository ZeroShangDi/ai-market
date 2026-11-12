/** Only internal, explicitly supported destinations may be resumed after login. */
export function loginDestination(value?:string){
 if(typeof value!=='string')return '/pages/mine/index';
 if(/^\/pages\/(?:index|apps|mine|notifications)\/index$/.test(value))return value;
 if(/^\/pages\/module\/index\?app=(?:chat|work|voice)$/.test(value))return value;
 return '/pages/mine/index';
}
export function loginUrl(destination?:string){return '/pages/login/index?redirect='+encodeURIComponent(loginDestination(destination));}
