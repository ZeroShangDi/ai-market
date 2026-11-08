from environment import environment,LOCAL
from api_check import request,login
from playwright.sync_api import sync_playwright,expect
import uuid,json

def main():
 env=environment();token=login(env['CONTAINER_ADMIN_USER'])['accessToken'];suffix=uuid.uuid4().hex[:8];identifier=None;checks=[];errors=[]
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':1600,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto('http://127.0.0.1:5188/login');page.get_by_placeholder('请输入用户名',exact=True).fill(env['CONTAINER_ADMIN_USER']);page.locator('input[placeholder="请输入密码"]:visible').fill(env['CONTAINER_ADMIN_PASSWORD']);page.get_by_role('button',name='登录',exact=True).click();page.wait_for_url('**/user/profile');page.goto('http://127.0.0.1:5188/pay/app');page.get_by_role('button',name='新增',exact=True).click();dialog=page.locator('.el-dialog:visible')
   dialog.get_by_placeholder('请输入应用名',exact=True).fill('独立商户验收'+suffix);dialog.get_by_placeholder('请输入应用标识',exact=True).fill('pay-ui-'+suffix);dialog.get_by_placeholder('请输入支付结果的回调地址').fill('https://example.invalid/pay');dialog.get_by_placeholder('请输入退款结果的回调地址').fill('https://example.invalid/refund')
   with page.expect_response(lambda r:'/pay/app/create' in r.url) as response:dialog.get_by_role('button',name='确 定',exact=True).click()
   result=response.value.json();assert result['code']==0;identifier=result['data'];dialog.wait_for(state='hidden');row=page.locator('.el-table__body-wrapper tr').filter(has_text='pay-ui-'+suffix);row.wait_for();checks.append('原支付应用表单实际创建并展示')
   assert page.get_by_text('模拟支付配置',exact=True).count()==0 and page.get_by_text('钱包支付配置',exact=True).count()==0
   row.locator('button.is-circle').last.click();dialog=page.locator('.el-dialog:visible');dialog.get_by_placeholder('请输入微信 APPID').wait_for();dialog.locator('.el-form-item').filter(has_text='商户号').locator('input').wait_for();dialog.get_by_role('button',name='取 消',exact=True).click();dialog.wait_for(state='hidden');checks.append('各应用独立微信渠道原配置表单可打开')
   page.screenshot(path=str(LOCAL/'payment-management-accepted.png'),full_page=True)
   for route,label in [('order','支付订单号'),('refund','商户退款单号'),('notify','商户订单编号')]:
    page.goto('http://127.0.0.1:5188/pay/'+route);page.locator('.el-table').wait_for();page.get_by_role('button',name='搜索',exact=True).wait_for();page.wait_for_timeout(300)
   checks.append('支付单、退款单、通知任务原页面正常加载');assert not errors,errors;browser.close()
  (LOCAL/'payment-browser-result.json').write_text(json.dumps({'passed':checks,'externalProviderCalled':False},ensure_ascii=False,indent=2));print('支付浏览器验收通过：'+str(len(checks))+' 项')
 finally:
  if identifier:assert request('/admin-api/pay/app/delete?id='+str(identifier),'DELETE',token=token)['code']==0
if __name__=='__main__':main()
