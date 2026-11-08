from environment import LOCAL,environment
from api_check import seed,login,request
from playwright.sync_api import sync_playwright,expect
import re,json

def main():
 env=environment();seed();checks=[];errors=[]
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True);page=b.new_page(viewport={'width':1440,'height':960},timezone_id='Asia/Shanghai');page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:5188/login');page.get_by_placeholder('请输入用户名',exact=True).fill(env['CONTAINER_ADMIN_USER']);page.locator('input[placeholder="请输入密码"]:visible').fill(env['CONTAINER_ADMIN_PASSWORD']);page.get_by_role('button',name='登录',exact=True).click();page.wait_for_url(re.compile('/user/profile'))
  page.get_by_text('验收示例',exact=True).first.click();page.frame_locator('iframe').get_by_role('heading',name='独立模块已打开').wait_for();assert page.locator('iframe').get_attribute('sandbox');checks.append('后台菜单直接接入独立模块，iframe 保持隔离')
  page.locator('.v-setting').click();drawer=page.locator('.el-drawer:visible');drawer.locator('.v-theme-switch').click();expect(page.locator('html')).to_have_class(re.compile('dark'));drawer.locator('.el-drawer__close-btn').click()
  page.locator('.v-locale-dropdown').click();page.locator('.el-dropdown-menu:visible').get_by_text('English',exact=True).click();expect(page.locator('.v-setting')).to_have_attribute('title','Project setting');expect(page.locator('html')).to_have_class(re.compile('dark'));page.reload();expect(page.locator('.v-setting')).to_have_attribute('title','Project setting');expect(page.locator('html')).to_have_class(re.compile('dark'));checks.append('原主题语言切换与刷新持久化')
  # Return to Chinese to verify the inherited administrative log pages.
  page.locator('.v-locale-dropdown').click();page.locator('.el-dropdown-menu:visible').get_by_text('简体中文',exact=True).click();expect(page.locator('.v-setting')).to_have_attribute('title','项目配置')
  token=login(env['CONTAINER_ADMIN_USER'])['accessToken'];menus=request('/admin-api/system/menu/list',token=token)['data'];byid={x['id']:x for x in menus}
  def route(item):
   if item['path'].startswith('/'):return item['path']
   parent=byid.get(item['parentId']);return (route(parent) if parent else '')+'/'+item['path']
  for component in ['system/loginlog/index','system/operatelog/index','infra/apiAccessLog/index','infra/apiErrorLog/index']:
   menu=next(x for x in menus if x.get('component')==component);page.goto('http://127.0.0.1:5188'+route(menu));page.locator('.el-table').first.wait_for();page.locator('.el-loading-mask:visible').wait_for(state='hidden')
  checks.append('原登录、操作、访问及错误日志管理页面真实加载')
  page.goto('http://127.0.0.1:5188/system/user');page.locator('.el-table').first.wait_for();page.screenshot(path=str(LOCAL/'management-shell.png'),full_page=True)
  assert not errors,errors;b.close()
 (LOCAL/'shell-result.json').write_text(json.dumps({'passed':checks},ensure_ascii=False,indent=2));print('原公共壳子验收通过：'+str(len(checks))+' 项')
if __name__=='__main__':main()
