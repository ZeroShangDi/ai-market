import {loginUrl} from './modules/auth-navigation';
import {initialConnection} from './modules/connection';
import { reactive } from 'vue';
import { createClient,normalizeConnection } from '../shared/client';
import { multipartDocument } from '../shared/multipart';
function readConnection(){
  return initialConnection(import.meta.env.VITE_CONTAINER_API_URL, uni.getStorageSync('container.connection'),
    uni.getStorageSync('container.url'), uni.getStorageSync('container.tenant'));
}
export const settings=reactive(readConnection());
export function saveSettings(baseUrl=settings.baseUrl,tenantId=settings.tenantId){
  const next=normalizeConnection(baseUrl,tenantId);
  uni.setStorageSync('container.connection',next);
  client.clear();settings.baseUrl=next.baseUrl;settings.tenantId=next.tenantId;
}
let hostAuthorization='';
export const client=createClient({
  request:(method,url,headers,body)=>{if(headers.Authorization)hostAuthorization=headers.Authorization;return new Promise((resolve,reject)=>uni.request({url,method:method as any,header:headers,data:body as any,success:r=>resolve({status:r.statusCode,data:r.data}),fail:()=>reject(new Error('连接失败'))}));},
  upload:(url,headers,file)=>new Promise((resolve,reject)=>{
    if(file && typeof file==='object' && 'contentBase64' in file){
      const value=file as {name:string;contentBase64:string};
      const bytes=new Uint8Array(uni.base64ToArrayBuffer(value.contentBase64));
      const multipart=multipartDocument(value.name,bytes);
      uni.request({url,method:'POST',header:{...headers,'Content-Type':multipart.contentType},data:multipart.body.buffer as ArrayBuffer,success:r=>resolve({status:r.statusCode,data:r.data}),fail:()=>reject(new Error('上传失败'))});
    }else uni.uploadFile({url,header:headers,filePath:String(file),name:'file',success:r=>{try{resolve({status:r.statusCode,data:JSON.parse(r.data)});}catch{reject(new Error('文件响应无效'));}},fail:()=>reject(new Error('上传失败'))});
  }),
},()=>settings);

export const session=reactive({identity:client.identity});
client.subscribe(value=>{session.identity=value;if(!value)hostAuthorization='';});
export async function signIn(username:string,password:string,captchaVerification?:string){
// #ifdef APP-PLUS
if(!settings.baseUrl)throw new Error('请先设置服务器地址');
// #endif
await client.login(username,password,captchaVerification);session.identity=client.identity;}
export async function signOut(){await client.logout();session.identity=null;uni.reLaunch({url:'/pages/index/index'});}
export function requireSession(){return !!session.identity;}
export function openLogin(destination?:string){const pages=getCurrentPages();if(pages[pages.length-1]?.route==='pages/login/index')return;uni.navigateTo({url:loginUrl(destination)});}


export async function applicationUrl(app:'chat'|'work'|'voice'){
 if(!requireSession())throw Error('请先登录');
 await client.request('GET','/admin-api/system/auth/get-permission-info');
 const base=applicationHost();
 if(base)normalizeConnection(base,'1');
 const value:any=await new Promise((resolve,reject)=>uni.request({url:base+'/mobile-host/ticket',method:'POST',header:{Authorization:hostAuthorization,'tenant-id':settings.tenantId},data:{app},success:r=>r.statusCode===200?resolve(r.data):reject(Error('应用服务未连接')),fail:()=>reject(Error('应用服务未连接'))}));
 return base+value.url;
}

export function applicationHost(){return settings.baseUrl.replace(/\/+$/,'');}
