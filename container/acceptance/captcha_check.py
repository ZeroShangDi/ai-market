"""Check the real production challenge without solving or bypassing it."""
from playwright.sync_api import sync_playwright
from environment import environment,LOCAL
import json

def main():
 env=environment()
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True);page=b.new_page();responses=[];page.on('response',lambda r:responses.append(r) if '/system/captcha/get' in r.url else None);page.goto('http://127.0.0.1:5189/login')
  page.locator('input[placeholder="请输入租户名称"]:visible').fill('容器');page.locator('input[placeholder="请输入用户名"]:visible').fill(env['CONTAINER_ADMIN_USER']);page.locator('input[placeholder="请输入密码"]:visible').fill(env['CONTAINER_ADMIN_PASSWORD'])
  page.get_by_role('button',name='登录',exact=True).click()
  page.locator('.verifybox:visible').wait_for();page.locator('.verifybox:visible img').first.wait_for();assert responses and responses[-1].json().get('repCode')=='0000';page.screenshot(path=str(LOCAL/'production-captcha.png'));b.close()
 (LOCAL/'captcha-result.json').write_text(json.dumps({'passed':['生产构建展示原滑块验证码并取得真实挑战；不自动解题']},ensure_ascii=False,indent=2));print('生产验证码真实挑战通过')
if __name__=='__main__':main()
