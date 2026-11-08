"""Real management UI publication workflow with transport-only test bytes, not a generated APK."""
from environment import environment,LOCAL
from api_check import request,login,sql
from playwright.sync_api import sync_playwright,expect
import subprocess,base64,json,uuid,shutil,urllib.request

def main():
 env=environment();suffix=uuid.uuid4().hex[:8];token=login(env['CONTAINER_ADMIN_USER'])['accessToken'];folder=LOCAL/('release-ui-'+suffix);folder.mkdir(mode=0o700);private=folder/'private.pem';app_id=None;package='dev.acceptance.ui'+suffix;checks=[];errors=[]
 subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',str(private)],check=True,capture_output=True);private.chmod(0o600)
 pub=base64.b64encode(subprocess.run(['openssl','pkey','-in',str(private),'-pubout','-outform','DER'],check=True,capture_output=True).stdout).decode()
 binary=folder/'transport-fixture.apk';binary.write_bytes(b'UI TRANSPORT FIXTURE ONLY, NOT AN INSTALLABLE APK\n')
 try:
  with sync_playwright() as p:
   b=p.chromium.launch(headless=True);page=b.new_page(viewport={'width':1440,'height':1000},accept_downloads=True);page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto('http://127.0.0.1:5188/login');page.get_by_placeholder('请输入用户名',exact=True).fill(env['CONTAINER_ADMIN_USER']);page.locator('input[placeholder="请输入密码"]:visible').fill(env['CONTAINER_ADMIN_PASSWORD']);page.get_by_role('button',name='登录',exact=True).click();page.wait_for_url('**/user/profile');page.goto('http://127.0.0.1:5188/infra/app-release');page.get_by_role('button',name='新增应用',exact=True).click();d=page.locator('.el-dialog:visible')
   d.get_by_placeholder('请输入应用名称',exact=True).fill('版本管理验收'+suffix);d.get_by_placeholder('请输入客户端内置的应用标识').fill('ui-release-'+suffix);d.get_by_placeholder('如 com.example.application').fill(package);d.get_by_placeholder('SPKI DER Base64公钥；不要填写私钥').fill(pub);d.get_by_placeholder('https://下载域名/api/v1/app-updates').fill('http://127.0.0.1:48090/api/v1/app-updates')
   with page.expect_response(lambda r:'/infra/app-release/application/save' in r.url) as result:d.get_by_role('button',name='保存',exact=True).click()
   data=result.value.json();assert data['code']==0;app_id=data['data'];d.wait_for(state='hidden');page.get_by_text(package,exact=True).wait_for();checks.append('原平台组件中的应用登记真实保存')
   page.get_by_role('button',name='上传安装包',exact=True).click();d=page.locator('.el-dialog:visible');d.locator('.el-form-item').filter(has=page.get_by_text('版本号',exact=True)).locator('input').fill('108');d.get_by_placeholder('与安装包中的versionName一致').fill('0.0-acceptance');d.get_by_placeholder('每行一条，1至3条，每条最多32字').fill('验证版本发布管理')
   with page.expect_file_chooser() as choice:d.locator('button').filter(has_text='选择APK').click()
   choice.value.set_files(str(binary))
   with page.expect_download() as result:d.get_by_role('button',name='上传并下载模板',exact=True).click()
   unsigned=folder/'unsigned.json';result.value.save_as(str(unsigned));metadata=json.loads(unsigned.read_text());assert metadata['release']['artifact']['bytes']==binary.stat().st_size;checks.append('流式上传并实际下载离线签名模板')
   def import_and_publish(value):
    payload=json.dumps(value,ensure_ascii=False,separators=(',',':'));signature=subprocess.run(['openssl','dgst','-sha256','-sign',str(private)],input=payload.encode(),check=True,capture_output=True).stdout;signed=folder/'signed.json';signed.write_text(json.dumps({'payload':payload,'signature':base64.b64encode(signature).decode()}))
    with page.expect_file_chooser() as choose:page.locator('button').filter(has_text='导入签名清单').click()
    with page.expect_response(lambda r:'/infra/app-release/import' in r.url) as response:choose.value.set_files(str(signed))
    assert response.value.json()['code']==0;row=page.locator('.el-table__body-wrapper tr').filter(has_text='草稿');row.wait_for();row.get_by_role('button',name='发布',exact=True).click()
    with page.expect_response(lambda r:'/infra/app-release/publish' in r.url) as response:page.locator('.el-message-box:visible').get_by_role('button',name='确定',exact=True).click()
    assert response.value.json()['code']==0;page.locator('.el-loading-mask:visible').wait_for(state='hidden');page.get_by_text('已发布',exact=True).wait_for()
    uri='http://127.0.0.1:48090/api/v1/app-updates/'+package+'/android/arm64-v8a/stable/manifest.json';return json.loads(json.load(urllib.request.urlopen(uri))['payload'])
   published=import_and_publish(metadata);assert published['sequence']==metadata['sequence'];checks.append('导入校验、真实确认发布与公开读取')
   with page.expect_download() as result:page.get_by_role('button',name='续期模板',exact=True).click()
   renewal=folder/'renew.json';result.value.save_as(str(renewal));renew=json.loads(renewal.read_text());assert renew['release']['artifact']==metadata['release']['artifact'];assert import_and_publish(renew)['release']['versionCode']==108;checks.append('原安装包同版本签名续期，无需伪造新版本')
   page.get_by_role('button',name='撤回目标版本',exact=True).click();d=page.locator('.el-dialog:visible')
   with page.expect_download() as result:d.get_by_role('button',name='下载撤回模板',exact=True).click()
   withdrawn=folder/'withdraw.json';result.value.save_as(str(withdrawn));withdrawal=json.loads(withdrawn.read_text());assert withdrawal['release'] is None;assert import_and_publish(withdrawal)['release'] is None;checks.append('管理页生成、导入并发布签名撤回')
   page.screenshot(path=str(LOCAL/'release-management-accepted.png'),full_page=True);assert not errors,errors;b.close()
  (LOCAL/'release-browser-result.json').write_text(json.dumps({'passed':checks,'artifactScope':'transport test bytes; no APK build or device installation'},ensure_ascii=False,indent=2));print('版本管理浏览器验收通过：'+str(len(checks))+' 项')
 finally:
  if app_id:sql('DELETE FROM infra_app_release WHERE application_id='+str(app_id)+';DELETE FROM infra_release_application WHERE id='+str(app_id)+" AND app_id='ui-release-"+suffix+"';")
  shutil.rmtree(LOCAL/'releases'/package,ignore_errors=True);shutil.rmtree(folder,ignore_errors=True)
if __name__=='__main__':main()
