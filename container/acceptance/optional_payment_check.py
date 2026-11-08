"""Actually build and run both variants; preserve the verified payment archive and all data."""
from environment import ROOT,LOCAL,environment
from api_check import login,request
import subprocess,zipfile,shutil,uuid,json,sys

def main():
 env=environment();jar=ROOT/'backend/server/target/yudao-server.jar';saved=LOCAL/('payments-verified-'+uuid.uuid4().hex+'.jar');shutil.copy2(jar,saved);checks=[]
 try:
  with zipfile.ZipFile(saved) as archive:assert any('/yudao-module-pay-' in name for name in archive.namelist())
  with (LOCAL/'optional-payment-build.log').open('w') as log:subprocess.run(['mvn','-q','-Daether.syncContext.named.factory=noop','-DskipTests','package'],cwd=ROOT/'backend',env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
  with zipfile.ZipFile(jar) as archive:assert not any('/yudao-module-pay-' in name for name in archive.namelist())
  checks.append('默认后端构建不包含支付模块及其SDK')
  subprocess.run([sys.executable,str(ROOT/'acceptance/start.py'),'--no-build'],env=env,check=True,capture_output=True)
  token=login(env['CONTAINER_ADMIN_USER'])['accessToken'];assert request('/admin-api/system/user/profile/get',token=token)['code']==0;assert request('/admin-api/pay/app/page?pageNo=1&pageSize=10',token=token)['code']!=0
  menus=request('/admin-api/system/auth/get-permission-info',token=token)['data']['menus'];assert all(menu.get('path')!='/pay' for menu in menus);checks.append('不装配支付时真实登录和个人中心正常，支付接口与菜单撤下')
 finally:
  shutil.copy2(saved,jar);saved.unlink()
  subprocess.run([sys.executable,str(ROOT/'acceptance/start.py'),'--with-payments','--no-build'],env=env,check=True,capture_output=True)
 token=login(env['CONTAINER_ADMIN_USER'])['accessToken'];assert request('/admin-api/pay/app/page?pageNo=1&pageSize=10',token=token)['code']==0;checks.append('恢复已验证可选包后支付模块重新可用，未删除数据')
 (LOCAL/'optional-payment-result.json').write_text(json.dumps({'passed':checks},ensure_ascii=False,indent=2));print('可选支付实际拆装验收通过：3 项')
if __name__=='__main__':main()
