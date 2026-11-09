"""History storage/security test; transport bytes are explicitly not an installable APK."""
from environment import environment,ROOT,LOCAL
from api_check import request,login,seed,sql
import subprocess,json,uuid,base64,hashlib,datetime,copy,shutil,urllib.request,urllib.error

def main():
 env=environment();seed();token=login(env['CONTAINER_ADMIN_USER'])['accessToken'];viewer=login('viewer')['accessToken'];suffix=uuid.uuid4().hex[:8];folder=LOCAL/('history-test-'+suffix);folder.mkdir(mode=0o700);private=folder/'key.pem';application=None;checks=[];pkg='dev.acceptance.history'+suffix
 subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',str(private)],check=True,capture_output=True);private.chmod(0o600)
 public=base64.b64encode(subprocess.run(['openssl','pkey','-in',str(private),'-pubout','-outform','DER'],check=True,capture_output=True).stdout).decode()
 def call(path,method='GET',data=None,**options):return request('/admin-api/infra/app-release'+path,method,data,token=token,**options)
 def ok(path,method='GET',data=None,**options):
  result=call(path,method,data,**options);assert result['code']==0,(path,result.get('msg'));return result['data']
 def envelope(metadata):
  payload=json.dumps(metadata,ensure_ascii=False,separators=(',',':'));signature=base64.b64encode(subprocess.run(['openssl','dgst','-sha256','-sign',str(private)],input=payload.encode(),capture_output=True,check=True).stdout).decode();return {'payload':payload,'signature':signature}
 def public_status():
  try:r=urllib.request.urlopen('http://127.0.0.1:48090/api/v1/app-updates/'+pkg+'/android/arm64-v8a/stable/manifest.json')
  except urllib.error.HTTPError as error:r=error
  return r.status
 try:
  app={'name':'历史归档验收','appId':'history-'+suffix,'packageName':pkg,'publicKey':public,'artifactBaseUrl':'http://127.0.0.1:48090/api/v1/app-updates'};application=ok('/application/save','POST',app)
  assert request('/admin-api/infra/app-release/history/list?applicationId='+str(application),token=viewer)['code']==403
  assert request('/admin-api/infra/app-release/history/import','POST',{'applicationId':application},token=viewer)['code']==403;checks.append('历史查询和导入保留原权限，未授权用户拒绝')
  binary=b'HISTORY TRANSPORT TEST - NOT AN ANDROID APK\n';artifact=ok('/artifact?applicationId='+str(application)+'&versionCode=108','POST',binary,content_type='application/octet-stream')
  data={'applicationId':application,'versionCode':108,'versionName':'0.0-history','architecture':'arm64-v8a','channel':'stable','notes':'','artifact':artifact,'certificates':['a'*64],'sourceReference':'108-'+artifact['sha256']+'.apk'}
  assert call('/history/import','POST',{**data,'applicationId':0})['code']==400
  record=ok('/history/import','POST',data);again=ok('/history/import','POST',data);assert record==again;detail=ok('/history/get?id='+str(record));assert detail['published_at'] is None and detail['source_kind']=='APK_ONLY' and detail['imported_at']>0 and public_status()==404
  checks.append('归档幂等，不编造发布时间，不自动激活公开更新')
  for field,value in [('sourceReference','../private/file.apk'),('certificates',['invalid'])]:
   invalid={**data,field:value};assert call('/history/import','POST',invalid)['code']==400
  corrupted=copy.deepcopy(data);corrupted['artifact']['sha256']='b'*64;assert call('/history/import','POST',corrupted)['code']==400
  altered={**data,'versionName':'wrong-name'};assert call('/history/import','POST',altered)['code']==400
  checks.append('路径、证书格式、哈希以及同版本身份冲突拒绝')
  now=datetime.datetime.now(datetime.timezone.utc);release={'id':'legacy-'+suffix,'appId':app['appId'],'platform':'android','architecture':'arm64-v8a','channel':'stable','versionCode':108,'versionName':'0.0-history','publishedAt':'2026-10-01T00:00:00Z','notes':'原签名更新说明','mandatory':False,'minBaseVersionCode':0,'artifact':{**artifact,'url':'https://legacy.invalid/original.apk'}}
  legacy=envelope({'release':release});bad={**legacy,'signature':base64.b64encode(b'bad').decode()};assert call('/history/import','POST',{**data,'legacyManifest':json.dumps(bad)})['code']==400
  assert ok('/history/import','POST',{**data,'legacyManifest':json.dumps(legacy)})==record
  detail=ok('/history/get?id='+str(record));assert detail['source_kind']=='SIGNED_LEGACY_MANIFEST' and detail['notes']==release['notes'] and detail['published_at']==int(datetime.datetime(2026,10,1,tzinfo=datetime.timezone.utc).timestamp()*1000)
  changed=envelope({'release':{**release,'notes':'不同签名证据'}});assert call('/history/import','POST',{**data,'legacyManifest':json.dumps(changed)})['code']==400
  assert public_status()==404;checks.append('旧清单真实验签，保留原说明与日期，拒绝覆盖签名证据')
  assert ok('/history/list?applicationId='+str(application)+'&pageNo=1&pageSize=1')['total']==1
  assert ok('/history/list?applicationId='+str(application)+'&channel=other')['total']==0
  assert ok('/target?applicationId='+str(application)+'&architecture=arm64-v8a&channel=stable')['versionCode']==108
  alternate=folder/'alternate.pem';subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',str(alternate)],check=True,capture_output=True);alternate.chmod(0o600)
  replacement=base64.b64encode(subprocess.run(['openssl','pkey','-in',str(alternate),'-pubout','-outform','DER'],check=True,capture_output=True).stdout).decode()
  assert call('/application/save','POST',{**app,'id':application,'publicKey':replacement})['code']==400
  checks.append('分页筛选可用，已签名旧版本纳入版本水位，公钥不能静默替换')
  def managed(version,artifact):
   content={**release,'versionCode':version,'artifact':artifact};metadata={'schemaVersion':2,'sequence':version-106,'issuedAt':now.isoformat().replace('+00:00','Z'),'expiresAt':(now+datetime.timedelta(days=1)).isoformat().replace('+00:00','Z'),'target':{'appId':app['appId'],'packageName':pkg,'platform':'android','architecture':'arm64-v8a','channel':'stable'},'release':content};return ok('/import','POST',{'applicationId':application,**envelope(metadata)})
  lower=ok('/artifact?applicationId='+str(application)+'&versionCode=107','POST',binary,content_type='application/octet-stream');draft=managed(107,lower);assert call('/publish?id='+str(draft),'POST')['code']==400
  same=managed(108,artifact);ok('/publish?id='+str(same),'POST');assert public_status()==200;checks.append('旧签名历史阻止降级，同包承接必须显式签名并发布')
  (LOCAL/'release-history-result.json').write_text(json.dumps({'passed':checks,'scope':'separate fixture app; not an APK; does not publish a real application'},ensure_ascii=False,indent=2));print('历史归档与更新承接验收通过：'+str(len(checks))+' 项')
 finally:
  if application:sql('DELETE FROM infra_app_release_history WHERE application_id='+str(application)+';DELETE FROM infra_app_release WHERE application_id='+str(application)+';DELETE FROM infra_release_application WHERE id='+str(application)+" AND app_id='history-"+suffix+"';")
  shutil.rmtree(LOCAL/'releases'/pkg,ignore_errors=True);shutil.rmtree(folder,ignore_errors=True)
if __name__=='__main__':main()
