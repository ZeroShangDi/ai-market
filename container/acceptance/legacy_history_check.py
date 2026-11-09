"""Read-only verification of imported real release archives and public APK transport."""
from environment import LOCAL,environment
from api_check import request,login
from pathlib import Path
import json,urllib.request,urllib.error,hashlib

def main():
 report=json.loads((LOCAL/'legacy-import-result.json').read_text());token=login(environment()['CONTAINER_ADMIN_USER'])['accessToken'];app=report['applicationId'];checks=[];downloaded=0
 try:
  def query(path):
   result=request('/admin-api/infra/app-release'+path,token=token);assert result['code']==0;return result['data']
  page=query('/history/list?applicationId='+str(app)+'&pageNo=1&pageSize=100');assert page['total']==len(report['records'])==16
  rows={r['versionCode']:r for r in page['list']};assert set(rows)=={r['versionCode'] for r in report['records']}
  for source in report['records']:
   row=rows[source['versionCode']];assert row['versionName']==source['versionName'] and row['artifactSha256']==source['sha256'] and row['artifactBytes']==source['bytes']
  checks.append('16个原本地版本完整入库，版本名、架构、大小及哈希与验包记录一致')
  for code,row in rows.items():
   assert (row['publishedAt'] is not None)==(code==123)
   detail=query('/history/get?id='+str(row['id']));assert json.loads(detail['certificates'])
   if code==123:
    original=json.loads(Path('.local/app-update/release/public/uni.UNID608100/android/arm64-v8a/stable/manifest.json').read_text());assert json.loads(detail['original_manifest'])==original and row['sourceKind']=='SIGNED_LEGACY_MANIFEST'
   else:assert detail['original_manifest'] is None and row['sourceKind']=='APK_ONLY'
  checks.append('原签名清单及发布时间保留，未留存日期不伪造')
  for code,row in rows.items():
   head=urllib.request.urlopen(urllib.request.Request(row['artifactUrl'],method='HEAD'),timeout=20);assert head.status==200 and int(head.headers['Content-Length'])==row['artifactBytes']
   partial=urllib.request.urlopen(urllib.request.Request(row['artifactUrl'],headers={'Range':'bytes=0-31'}),timeout=20);assert partial.status==206 and len(partial.read())==32
   digest=hashlib.sha256();size=0
   with urllib.request.urlopen(row['artifactUrl'],timeout=60) as response:
    while chunk:=response.read(1024*1024):digest.update(chunk);size+=len(chunk)
   assert digest.hexdigest()==row['artifactSha256'] and size==row['artifactBytes'];downloaded+=size
  checks.append('全部16个真实安装包HEAD、Range和完整下载哈希校验通过')
  assert query('/list?applicationId='+str(app))['total']==0
  uri='http://127.0.0.1:48090/api/v1/app-updates/'+report['packageName']+'/android/arm64-v8a/stable/manifest.json'
  try:r=urllib.request.urlopen(uri,timeout=10)
  except urllib.error.HTTPError as error:r=error
  assert r.status==404
  checks.append('历史迁入不生成发布草稿，不激活更新推送')
  assert query('/target?applicationId='+str(app)+'&architecture=arm64-v8a&channel=stable')['versionCode']==123
  checks.append('原签名最高版本123进入防降级水位')
  (LOCAL/'legacy-history-verification.json').write_text(json.dumps({'passed':checks,'applicationId':app,'versions':len(rows),'downloadedBytes':downloaded,'deviceInstallationVerified':False},ensure_ascii=False,indent=2));print('真实历史版本验证通过：5 项，16个包，完整下载 '+str(downloaded)+' 字节')
 finally:request('/admin-api/system/auth/logout','POST',token=token)
if __name__=='__main__':main()
