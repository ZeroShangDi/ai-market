from environment import LOCAL,environment
from api_check import seed
from playwright.sync_api import sync_playwright,expect
import json

def main():
 env=environment();seed();checks=[];errors=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True);ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Shanghai',accept_downloads=True);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:5190/');page.locator('.account-action').click();page.locator('input').nth(0).fill(env['CONTAINER_ADMIN_USER']);page.locator('input').nth(1).fill(env['CONTAINER_ADMIN_PASSWORD']);page.get_by_text('登录',exact=True).click();page.locator('.account-action').wait_for();page.get_by_text('管理员',exact=True).wait_for();checks.append('原移动页头、账户页与真实登录')
  def back():page.get_by_role('button',name='返回',exact=True).click()
  page.get_by_text('文件',exact=True).click();sample=LOCAL/'移动验收文档.txt';sample.write_text('Mobile real document\n')
  with page.expect_file_chooser() as chooser:page.get_by_text('选择文件',exact=True).click()
  chooser.value.set_files(str(sample));page.get_by_text('上传成功',exact=True).wait_for()
  with page.expect_download() as download:page.get_by_text('下载文件',exact=True).click()
  download.value.save_as(str(LOCAL/'mobile-document.txt'));assert (LOCAL/'mobile-document.txt').read_bytes()==sample.read_bytes();checks.append('移动独立文件页上传下载中文文件')
  back();page.get_by_text('通知',exact=True).click();page.get_by_text('欢迎验收公共通知',exact=True).wait_for();page.get_by_text('标记已读',exact=True).click();page.get_by_text('标记已读',exact=True).wait_for(state='hidden');checks.append('移动通知分页与已读状态')
  back();page.get_by_text('配置',exact=True).click();page.locator('input:not([type=file]):visible').first.fill('container.acceptance');page.get_by_text('读取配置',exact=True).click();page.get_by_text('公共配置读取成功',exact=True).wait_for();checks.append('移动独立配置页真实读取')
  back();page.screenshot(path=str(LOCAL/'mobile-workbench.png'),full_page=True);page.get_by_role('button',name='我的',exact=True).click();page.get_by_text('账户与连接',exact=True).wait_for()
  with page.expect_download() as download:page.get_by_text('导出日志',exact=True).click()
  download.value.save_as(str(LOCAL/'mobile-logs.jsonl'));assert env['CONTAINER_ADMIN_PASSWORD'] not in (LOCAL/'mobile-logs.jsonl').read_text();checks.append('原我的页面与真实日志导出')
  page.screenshot(path=str(LOCAL/'mobile-mine.png'),full_page=True);page.get_by_role('button',name='应用',exact=True).click();page.get_by_text('应用广场',exact=True).wait_for();page.get_by_text('验收示例',exact=True).click();page.frame_locator('iframe').get_by_role('heading',name='独立模块已打开').wait_for();checks.append('原应用广场与独立模块接入')
  assert not errors,errors
  browser.close()
 (LOCAL/'mobile-result.json').write_text(json.dumps({'passed':checks},ensure_ascii=False,indent=2));print('移动公共界面验收通过：'+str(len(checks))+' 项')
if __name__=='__main__':main()
