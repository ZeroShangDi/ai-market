"""The public Token API proxy must not pass or replace the monitor session cookie."""
from environment import environment,LOCAL
from api_check import login,request
from playwright.sync_api import sync_playwright
import json,re

def main():
 env=environment();token=login(env['CONTAINER_ADMIN_USER'])['accessToken'];menus=request('/admin-api/system/menu/list',token=token)['data'];byid={m['id']:m for m in menus}
 def route(m):return m['path'] if m['path'].startswith('/') else route(byid[m['parentId']])+'/'+m['path']
 def path(component):return route(next(m for m in menus if m.get('component')==component))
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  for iteration in range(3):
   context=browser.new_context();page=context.new_page();page.goto('http://127.0.0.1:5188/login');page.get_by_placeholder('请输入用户名',exact=True).fill(env['CONTAINER_ADMIN_USER']);page.locator('input[placeholder="请输入密码"]:visible').fill(env['CONTAINER_ADMIN_PASSWORD']);page.get_by_role('button',name='登录',exact=True).click();page.wait_for_url('**/user/profile');page.goto('http://127.0.0.1:5188'+path('infra/server/index'));frame=page.frame_locator('iframe[title="监控中心"]');frame.locator('input[name=username]').fill(env['CONTAINER_MONITOR_USER']);frame.locator('input[name=password]').fill(env['CONTAINER_MONITOR_PASSWORD']);frame.get_by_role('button',name='Login',exact=True).click();frame.get_by_text('yudao-server',exact=False).first.wait_for()
   before=next(c['value'] for c in context.cookies() if c['name']=='JSESSIONID')
   result=page.evaluate('''async token => Promise.all(Array.from({length:24},async()=>{const r=await fetch('/admin-api/system/user/profile/get',{headers:{Authorization:'Bearer '+token,'tenant-id':'1'}});return (await r.json()).code}))''',token)
   assert all(code==0 for code in result)
   after=next(c['value'] for c in context.cookies() if c['name']=='JSESSIONID');assert before==after,'业务接口不应更换监控会话标识'
   page.goto('http://127.0.0.1:5188'+path('infra/druid/index'));page.frame_locator('iframe[title="监控中心"]').get_by_text(re.compile(r'1\.2\.\d+'),exact=True).first.wait_for()
   assert page.request.post('http://127.0.0.1:5188/druid/basic.json').status==403
   result=page.evaluate('''async () => {const token=decodeURIComponent(document.cookie.split('; ').find(v=>v.startsWith('XSRF-TOKEN=')).slice(11));return (await fetch('/admin/logout',{method:'POST',headers:{'X-XSRF-TOKEN':token}})).status}''');assert result in [200,204],("monitor logout status",result)
   status=page.request.get('http://127.0.0.1:5188/druid/index.html',max_redirects=0).status;assert status in [302,401],('monitor after logout',status)
   assert request('/admin-api/system/user/profile/get',token=token)['code']==0
   context.close()
  browser.close()
 checks=['3轮监控表单登录及24路并发业务请求不更换监控会话','每轮切换Druid加载真指标，无CSRF请求继续拒绝','监控退出独立失效，不注销业务令牌']
 (LOCAL/'monitor-session-result.json').write_text(json.dumps({'passed':checks,'iterations':3,'concurrentBusinessRequestsPerIteration':24},ensure_ascii=False,indent=2));print('监控会话隔离验收通过：3 项，连续3轮')
if __name__=='__main__':main()
