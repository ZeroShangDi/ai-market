"""Real WebSocket handshake, tenant separation, revocation, and original management UI."""
from environment import environment,LOCAL
from api_check import seed,login,request,sql
from playwright.sync_api import sync_playwright,expect
import urllib.request,urllib.error,base64,os,json

def main():
 env=environment();seed();admin=login(env['CONTAINER_ADMIN_USER'])['accessToken'];viewer=login('viewer')['accessToken'];revocable=login(env['CONTAINER_ADMIN_USER'])['accessToken'];checks=[]
 sql("""INSERT INTO system_tenant (id,name,contact_user_id,contact_name,package_id,expire_time,account_count,websites) VALUES (900001,'extension-tenant',900001,'fixture',0,'2099-12-31',100,'[]');
 INSERT INTO system_users (id,username,password,nickname,tenant_id,post_ids) SELECT 900001,'extensiontenant',password,'extension-fixture',900001,'[]' FROM system_users WHERE id=1;
 INSERT INTO system_role (id,name,code,sort,data_scope,data_scope_dept_ids,status,type,tenant_id) VALUES (900001,'extension-socket','extension_socket',0,1,'[]',0,2,900001);
 INSERT INTO system_user_role (user_id,role_id,tenant_id) VALUES (900001,900001,900001);
 INSERT INTO system_role_menu (role_id,menu_id,tenant_id) VALUES (900001,565,900001);""")
 try:
  req=urllib.request.Request('http://127.0.0.1:48090/admin-api/system/auth/login',data=json.dumps({'username':'extensiontenant','password':env['CONTAINER_ADMIN_PASSWORD']}).encode(),headers={'Content-Type':'application/json','tenant-id':'900001'})
  r=json.load(urllib.request.urlopen(req));assert r['code']==0;other=r['data']['accessToken']
  req=urllib.request.Request('http://127.0.0.1:48090/infra/ws?token='+admin,headers={'Origin':'https://untrusted.invalid','Upgrade':'websocket','Connection':'Upgrade','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':base64.b64encode(os.urandom(16)).decode()})
  try:urllib.request.urlopen(req);raise AssertionError('untrusted origin accepted')
  except urllib.error.HTTPError as e:assert e.code==403
  checks.append('非白名单来源握手被拒绝')
  with sync_playwright() as p:
   b=p.chromium.launch(headless=True);page=b.new_page();page.goto('http://127.0.0.1:5188/login')
   result=page.evaluate('''async ({admin,other,viewer,revocable}) => {
    const url=t=>'ws://127.0.0.1:5188/infra/ws'+(t?'?token='+encodeURIComponent(t):'');
    const connect=t=>new Promise(resolve=>{const s=new WebSocket(url(t));s.onopen=()=>resolve(s);s.onerror=()=>resolve(null)});
    const a=await connect(admin),b=await connect(other),r=await connect(revocable);if(!a||!b||!r)throw Error('authorized connection failed');
    const rejected=await connect(viewer),anonymous=await connect('');if(rejected||anonymous)throw Error('unauthorized connection accepted');
    const ar=[],br=[];a.onmessage=e=>ar.push(JSON.parse(e.data));b.onmessage=e=>br.push(JSON.parse(e.data));
    a.send(JSON.stringify({type:'demo-message-send',content:JSON.stringify({text:'tenant-boundary-check'})}));
    await new Promise(r=>setTimeout(r,600));if(ar.length!==1||br.length!==0)throw Error('tenant broadcast leak');
    a.send(JSON.stringify({type:'demo-message-send',content:JSON.stringify({text:'cross-tenant-unicast',toUserId:900001})}));
    await new Promise(r=>setTimeout(r,600));if(br.length!==0)throw Error('tenant unicast leak');
    window.revokedSocket=r;a.close();b.close();return true
   }''',{'admin':admin,'other':other,'viewer':viewer,'revocable':revocable});assert result
   checks.extend(['无登录和无权限连接被拒绝','同租户广播到达，跨租户广播和单发均隔离'])
   assert request('/admin-api/system/auth/logout','POST',token=revocable)['code']==0
   code=page.evaluate('''() => new Promise(resolve=>{window.revokedSocket.onclose=e=>resolve(e.code);window.revokedSocket.send('ping');setTimeout(()=>resolve(-1),3000)})''');assert code==1008,code;checks.append('退出后已有连接再次通信被关闭')
   # The retained page must connect through the proxy, not display the token in its endpoint.
   page.get_by_placeholder('请输入用户名',exact=True).fill(env['CONTAINER_ADMIN_USER']);page.locator('input[placeholder="请输入密码"]:visible').fill(env['CONTAINER_ADMIN_PASSWORD']);page.get_by_role('button',name='登录',exact=True).click();page.wait_for_url('**/user/profile');page.goto('http://127.0.0.1:5188/infra/websocket');page.get_by_role('button',name='开启连接',exact=True).click();page.get_by_text('OPEN',exact=True).wait_for();page.get_by_placeholder('请输入你要发送的消息').fill('original-websocket-page');page.get_by_role('button',name='发送',exact=True).click();page.get_by_text('【群发】用户编号(1)：original-websocket-page',exact=True).wait_for();assert 'token=' not in page.locator('body').inner_text();page.screenshot(path=str(LOCAL/'websocket-accepted.png'),full_page=True);checks.append('原通信页面真实连接收发且不展示令牌');b.close()
  (LOCAL/'websocket-result.json').write_text(json.dumps({'passed':checks},ensure_ascii=False,indent=2));print('WebSocket 边界与页面验收通过：'+str(len(checks))+' 项')
 finally:
  sql("""DELETE FROM system_oauth2_access_token WHERE user_id=900001;DELETE FROM system_oauth2_refresh_token WHERE user_id=900001;
  DELETE FROM system_user_role WHERE user_id=900001;DELETE FROM system_role_menu WHERE role_id=900001;DELETE FROM system_role WHERE id=900001 AND code='extension_socket';DELETE FROM system_users WHERE id=900001 AND username='extensiontenant';DELETE FROM system_tenant WHERE id=900001 AND name='extension-tenant';""")
if __name__=='__main__':main()
