"""Exercise the retained Yudao management forms against the real isolated backend."""
from environment import LOCAL, environment
from api_check import request, login, seed
from playwright.sync_api import sync_playwright, expect
import re,uuid,json

env=environment();base='http://127.0.0.1:5188';suffix=uuid.uuid4().hex[:8];username='check'+suffix;rolecode='check'+suffix;role_name='验收角色'+suffix;configkey='acceptance.'+suffix
class Checks(list):
 def append(self,value):super().append(value);print('通过：'+value,flush=True)
checks=Checks();owned={};errors=[]
def main():
 seed();admin=login(env['CONTAINER_ADMIN_USER'])['accessToken']
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True);ctx=browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Asia/Shanghai',accept_downloads=True);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  def signin(user):
   page.goto(base+'/login');page.locator('input[placeholder="请输入用户名"]:visible').fill(user);page.locator('input[placeholder="请输入密码"]:visible').fill(env['CONTAINER_ADMIN_PASSWORD']);page.get_by_role('button',name='登录',exact=True).click();page.wait_for_url(re.compile('/user/profile'));page.locator('.el-menu').first.wait_for()
  def goto(path):page.goto(base+path);page.locator('.el-table').first.wait_for();page.locator('.el-loading-mask:visible').wait_for(state='hidden')
  def dialog():return page.locator('.el-dialog:visible').last
  def submit(path):
   d=dialog()
   with page.expect_response(lambda r:r.url.split('?')[0].endswith(path) and r.request.method in ['POST','PUT']) as response:d.get_by_role('button',name=re.compile('确\\s*定')).click()
   data=response.value.json();assert data['code']==0,(path,data['code']);d.wait_for(state='hidden');return data['data']
  signin(env['CONTAINER_ADMIN_USER']);checks.append('原芋道登录、完整管理布局和个人中心')
  goto('/system/user');page.get_by_role('button',name='新增',exact=True).click();d=dialog();d.get_by_placeholder('请输入用户昵称').fill('验收用户'+suffix);d.get_by_placeholder('请输入用户名称').fill(username);d.get_by_placeholder('请输入用户密码').fill(env['CONTAINER_ADMIN_PASSWORD']);owned['user']=submit('/system/user/create');row=page.locator('.el-table__body-wrapper tr').filter(has_text=username);row.wait_for();checks.append('用户管理真实新增')
  row.get_by_role('button',name='修改',exact=True).click();expect(dialog().get_by_placeholder('请输入用户昵称')).to_have_value('验收用户'+suffix);dialog().get_by_placeholder('请输入用户昵称').fill('已修改'+suffix);submit('/system/user/update');page.get_by_text('已修改'+suffix,exact=True).wait_for();checks.append('用户管理真实修改')
  goto('/system/role');page.get_by_role('button',name='新增',exact=True).click();d=dialog();d.get_by_placeholder('请输入角色名称').fill(role_name);d.get_by_placeholder('请输入角色标识').fill(rolecode);d.get_by_placeholder('请输入显示顺序').fill('1');owned['role']=submit('/system/role/create');row=page.locator('.el-table__body-wrapper tr').filter(has_text=role_name);row.wait_for();checks.append('角色管理真实新增')
  row.get_by_role('button',name='菜单权限',exact=True).click();d=dialog();d.locator('.el-switch').first.click();submit('/system/permission/assign-role-menu');assert request('/admin-api/system/permission/list-role-menus?roleId='+str(owned['role']),token=admin)['data'];checks.append('原菜单权限树保存生效')
  menus=request('/admin-api/system/menu/list',token=admin)['data'];ids=[m['id'] for m in menus if m['id'] in [2,920001,10] or m.get('permission')=='infra:config:query'];assert request('/admin-api/system/permission/assign-role-menu','POST',{'roleId':owned['role'],'menuIds':ids},token=admin)['code']==0
  goto('/system/user');row=page.locator('.el-table__body-wrapper tr').filter(has_text=username);row.get_by_role('button',name='更多',exact=True).hover();page.locator('.el-dropdown-menu:visible').get_by_text('分配角色',exact=True).click();d=dialog();d.locator('.el-select').click();page.get_by_role('option',name=role_name,exact=True).click();d.locator('.el-dialog__header').click();submit('/system/permission/assign-user-role');assert owned['role'] in request('/admin-api/system/permission/list-user-roles?userId='+str(owned['user']),token=admin)['data'];checks.append('原用户角色分配表单保存生效')
  restricted=login(username)['accessToken'];assert request('/admin-api/system/user/page?pageNo=1&pageSize=10',token=restricted)['code']==403;assert request('/admin-api/infra/config/page?pageNo=1&pageSize=10',token=restricted)['code']==0;checks.append('新建角色授权与越权拒绝')
  goto('/infra/config');page.get_by_role('button',name='新增',exact=True).click();d=dialog()
  for placeholder,value in [('请输入参数分类','acceptance'),('请输入参数名称','验收配置'+suffix),('请输入参数键名',configkey),('请输入参数键值','initial')]:d.get_by_placeholder(placeholder).fill(value)
  owned['config']=submit('/infra/config/create');row=page.locator('.el-table__body-wrapper tr').filter(has_text=configkey);row.wait_for();row.get_by_role('button',name='编辑',exact=True).click();expect(dialog().get_by_placeholder('请输入参数键值')).to_have_value('initial');dialog().get_by_placeholder('请输入参数键值').fill('updated');submit('/infra/config/update');assert request('/admin-api/infra/config/get-value-by-key?key='+configkey,token=admin)['data']=='updated';checks.append('配置管理完整新增修改及公开读取')
  goto('/infra/file/file');page.get_by_role('button',name='上传文件',exact=True).click();d=dialog();file=LOCAL/('management-'+suffix+'.txt');file.write_text('Yudao real file upload\n');d.locator('input[type=file]').set_input_files(str(file))
  with page.expect_response(lambda r:'/infra/file/upload' in r.url and r.request.method=='POST') as response:d.get_by_role('button',name=re.compile('确\\s*定')).click()
  upload=response.value.json();assert upload['code']==0;assert ctx.request.get(upload['data']).body()==file.read_bytes();d.wait_for(state='hidden');page.locator('.el-table__body-wrapper tr').filter(has_text=file.name).wait_for();checks.append('原文件管理上传、列表与字节下载')
  goto('/user/notify-message');page.locator('.el-table__body-wrapper tr').filter(has_text='欢迎验收公共通知').first.wait_for();checks.append('原站内信页面与真实通知')
  # Verify the complete layout remained intact; screenshots contain no passwords.
  goto('/system/user');page.screenshot(path=str(LOCAL/'management-users.png'),full_page=True)
  assert not errors,errors
  browser.close()
 (LOCAL/'management-result.json').write_text(json.dumps({'passed':checks},ensure_ascii=False,indent=2));print('芋道管理界面验收通过：'+str(len(checks))+' 项')
if __name__=='__main__':
 try:main()
 finally:
  admin=login(env['CONTAINER_ADMIN_USER'])['accessToken']
  for kind,path in [('user','system/user'),('role','system/role'),('config','infra/config')]:
   if kind in owned:request('/admin-api/'+path+'/delete?id='+str(owned[kind]),'DELETE',token=admin)

