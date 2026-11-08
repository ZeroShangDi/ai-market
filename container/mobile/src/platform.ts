import { reactive } from 'vue';
import { createClient,normalizeConnection } from '../../shared/client';
import { multipartDocument } from '../../shared/multipart';
function readConnection(){
  try{
    const saved=uni.getStorageSync('container.connection');
    const base=typeof saved?.baseUrl==='string'?saved.baseUrl:(uni.getStorageSync('container.url')||import.meta.env.VITE_CONTAINER_API_URL||'');
    const tenant=typeof saved?.tenantId==='string'?saved.tenantId:(uni.getStorageSync('container.tenant')||'1');
    return normalizeConnection(base,tenant);
  }catch{return {baseUrl:'',tenantId:'1'};}
}
export const settings=reactive(readConnection());
export function saveSettings(baseUrl=settings.baseUrl,tenantId=settings.tenantId){
  const next=normalizeConnection(baseUrl,tenantId);
  uni.setStorageSync('container.connection',next);
  client.clear();settings.baseUrl=next.baseUrl;settings.tenantId=next.tenantId;
}
export const client=createClient({
  request:(method,url,headers,body)=>new Promise((resolve,reject)=>uni.request({url,method:method as any,header:headers,data:body as any,success:r=>resolve({status:r.statusCode,data:r.data}),fail:()=>reject(new Error('连接失败'))})),
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
client.subscribe(value=>{session.identity=value;});
export async function signIn(username:string,password:string){
// #ifdef APP-PLUS
if(!settings.baseUrl)throw new Error('请先设置服务器地址');
// #endif
await client.login(username,password);session.identity=client.identity;}
export async function signOut(){await client.logout();session.identity=null;uni.reLaunch({url:'/pages/index/index'});}
export function requireSession(){if(session.identity)return true;uni.navigateTo({url:'/pages/account/index'});return false;}
export function openEntry(id:string){uni.navigateTo({url:'/pages/module/index?id='+encodeURIComponent(id)});}
