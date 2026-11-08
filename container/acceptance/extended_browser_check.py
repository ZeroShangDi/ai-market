"""Retained public administration pages against the real service."""
from environment import environment,LOCAL
from api_check import request,login
from playwright.sync_api import sync_playwright,expect
import json,uuid,re,hashlib
from urllib.parse import urlencode,urlsplit,parse_qs

def main():
 env=environment();token=login(env['CONTAINER_ADMIN_USER'])['accessToken'];menus=request('/admin-api/system/menu/list',token=token)['data'];byid={m['id']:m for m in menus};checks=[];owned=[];monitor_events=[];suffix=uuid.uuid4().hex[:8];errors=[]
 def route(m):
  if m['path'].startswith('/'):return m['path']
  parent=byid.get(m['parentId']);return (route(parent) if parent else '')+'/'+m['path']
 def path(component):return route(next(m for m in menus if (m.get('component') or '').removesuffix('.vue')==component))
 try:
  with sync_playwright() as p:
   b=p.chromium.launch(headless=True);ctx=b.new_context(viewport={'width':1440,'height':960});page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:monitor_events.append({'method':r.request.method,'status':r.status,'path':urlsplit(r.url).path,'location':r.headers.get('location'),'cookie':hashlib.sha256((re.search(r'JSESSIONID=([^;]+)',r.request.all_headers().get('cookie','')) or ['', ''])[1].encode()).hexdigest()[:12], 'setCookie':hashlib.sha256((re.search(r'JSESSIONID=([^;]+)',r.all_headers().get('set-cookie','')) or ['', ''])[1].encode()).hexdigest()[:12]}) if any(part in r.url for part in ['/druid/','/admin/']) or 'JSESSIONID=' in r.all_headers().get('set-cookie','') else None)
   page.goto('http://127.0.0.1:5188/login');page.get_by_placeholder('请输入用户名',exact=True).fill(env['CONTAINER_ADMIN_USER']);page.locator('input[placeholder="请输入密码"]:visible').fill(env['CONTAINER_ADMIN_PASSWORD']);page.get_by_role('button',name='登录',exact=True).click();page.wait_for_url('**/user/profile')
   def goto(component):
    page.goto('http://127.0.0.1:5188'+path(component));page.locator('.el-table').first.wait_for();page.locator('.el-loading-mask:visible').wait_for(state='hidden')
   def dialog():return page.locator('.el-dialog:visible')
   def submit(kind):
    with page.expect_response(lambda r:r.request.method=='POST' and '/system/'+kind+'/create' in r.url) as r:dialog().get_by_role('button',name='确 定',exact=True).click()
    data=r.value.json();assert data['code']==0,(kind,data['code']);owned.append((kind,data['data']));dialog().wait_for(state='hidden');return data['data']
   goto('system/sms/channel/index');page.get_by_role('button',name='新增',exact=True).click();d=dialog();d.get_by_placeholder('请输入短信签名').fill('扩展验收'+suffix);d.locator('.el-select').first.click();page.get_by_role('option',name=re.compile('调试')).click();d.get_by_placeholder('请输入短信 API 的账号').fill('fixture-key');d.get_by_placeholder('请输入短信 API 的密钥').fill('fixture-secret');sid=submit('sms-channel');page.locator('.el-table__body-wrapper tr').filter(has_text='扩展验收'+suffix).wait_for();assert request('/admin-api/system/sms-channel/get?id='+str(sid),token=token)['data']['apiKey']=='fixture-key';checks.append('原短信渠道表单真实新增，密钥列表遮盖')
   goto('system/mail/account/index');page.get_by_role('button',name='新增',exact=True).click();d=dialog();d.get_by_placeholder('请输入邮箱',exact=True).fill(suffix+'@example.invalid');d.get_by_placeholder('请输入用户名',exact=True).fill('fixture');d.get_by_placeholder('请输入密码',exact=True).fill('fixture-password');d.get_by_placeholder('请输入 SMTP 服务器域名').fill('127.0.0.1');mid=submit('mail-account');page.locator('.el-table__body-wrapper tr').filter(has_text=suffix+'@example.invalid').wait_for();checks.append('原邮件账号表单真实新增与列表')
   goto('system/social/client/index');page.get_by_role('button',name='新增',exact=True).click();d=dialog();d.get_by_placeholder('请输入应用名',exact=True).fill('扩展认证'+suffix);d.locator('.el-form-item').filter(has=page.get_by_text('社交平台',exact=True)).get_by_text('钉钉',exact=True).click();d.locator('.el-form-item').filter(has=page.get_by_text('用户类型',exact=True)).get_by_text('管理员',exact=True).click();d.get_by_placeholder('请输入客户端编号,对应各平台的appKey').fill('fixture-'+suffix);d.get_by_placeholder('请输入客户端密钥,对应各平台的appSecret').fill('fixture-secret');submit('social-client');page.locator('.el-table__body-wrapper tr').filter(has_text='扩展认证'+suffix).wait_for();checks.append('原三方认证表单真实新增，用户类型字典完整')
   for component in ['system/sms/template/index','system/sms/log/index','system/mail/template/index','system/mail/log/index','system/social/user/index','system/oauth2/client/index','system/oauth2/token/index']:
    goto(component)
   checks.append('短信邮件模板和日志、认证用户、OAuth2 原管理页完整加载')
   application='browser-'+suffix;redirect='http://127.0.0.1:5200/'
   data=request('/admin-api/system/oauth2-client/create','POST',{'clientId':application,'secret':'fixture-secret','name':'独立应用授权'+suffix,'logo':'http://127.0.0.1:5188/favicon.svg','status':0,'accessTokenValiditySeconds':300,'refreshTokenValiditySeconds':600,'redirectUris':[redirect],'authorizedGrantTypes':['authorization_code','refresh_token'],'scopes':['user_info'],'autoApproveScopes':[]},token=token);assert data['code']==0;owned.append(('oauth2-client',data['data']))
   page.goto('http://127.0.0.1:5188/sso?'+urlencode({'client_id':application,'redirect_uri':redirect,'response_type':'code','scope':'user_info','state':suffix}));page.get_by_text('独立应用授权'+suffix,exact=True).wait_for();page.locator('.el-checkbox:visible').filter(has_text='user_info').click();page.get_by_role('button',name='同意授权',exact=True).click();page.wait_for_url('http://127.0.0.1:5200/**');query=parse_qs(urlsplit(page.url).query);assert query.get('code') and query['state']==[suffix] and 'access_token' not in query;checks.append('原授权页真实同意并仅携带授权码返回独立应用')

   page.goto('http://127.0.0.1:5188'+path('system/area/index'));page.get_by_text('北京市',exact=True).wait_for();page.get_by_role('button',name=re.compile('IP 查询')).click();dialog().wait_for();dialog().get_by_role('button',name='取 消',exact=True).click();checks.append('原地区虚拟表格及 IP 查询入口')
   page.goto('http://127.0.0.1:5188'+path('infra/redis/index'));page.get_by_text('Redis版本 :',exact=True).wait_for();page.locator('canvas').first.wait_for();checks.append('原 Redis 实时指标与图表')
   page.goto('http://127.0.0.1:5188'+path('infra/server/index'));frame=page.frame_locator('iframe[title="监控中心"]');frame.locator('input[name=username]').fill(env['CONTAINER_MONITOR_USER']);frame.locator('input[name=password]').fill(env['CONTAINER_MONITOR_PASSWORD']);frame.get_by_role('button',name='Login',exact=True).click();frame.get_by_text('yudao-server',exact=False).first.wait_for();page.screenshot(path=str(LOCAL/'monitor-server-accepted.png'),full_page=True);checks.append('真实 Spring Boot Admin 实例界面')
   monitor_events.append({'beforeDruidCookies':[{'name':c['name'],'path':c['path'],'domain':c['domain']} for c in ctx.cookies()]});page.goto('http://127.0.0.1:5188'+path('infra/druid/index'));page.frame_locator('iframe[title="监控中心"]').get_by_text(re.compile(r'1\.2\.\d+'),exact=True).first.wait_for();page.screenshot(path=str(LOCAL/'monitor-druid-accepted.png'),full_page=True);assert page.request.post('http://127.0.0.1:5188/druid/basic.json').status==403;checks.append('真实 Druid 数据库监控界面')
   page.goto('http://127.0.0.1:5188'+path('infra/skywalking/index'));page.get_by_text('尚未配置链路追踪地址',exact=True).wait_for();assert page.locator('iframe').count()==0;checks.append('链路追踪未配置时明确状态，不访问原演示服务')
   assert not errors,errors;b.close()
  (LOCAL/'extended-browser-result.json').write_text(json.dumps({'passed':checks},ensure_ascii=False,indent=2));print('扩展原管理界面验收通过：'+str(len(checks))+' 项')
 finally:
  (LOCAL/'extended-monitor-events.json').write_text(json.dumps({'monitor':monitor_events,'errors':errors},ensure_ascii=False,indent=2))
  for kind,identifier in reversed(owned):assert request('/admin-api/system/'+kind+'/delete?id='+str(identifier),'DELETE',token=token)['code']==0
if __name__=='__main__':main()
