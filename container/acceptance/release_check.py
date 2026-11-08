"""Signed release-control and public transport acceptance; bytes are NOT an installable APK."""
from environment import environment,LOCAL
from api_check import request,login,seed,sql
import subprocess,base64,json,uuid,hashlib,urllib.request,urllib.error,datetime,copy,shutil

def main():
 env=environment();seed();token=login(env['CONTAINER_ADMIN_USER'])['accessToken'];viewer=login('viewer')['accessToken'];suffix=uuid.uuid4().hex[:8];checks=[];app=None
 directory=LOCAL/('release-check-'+suffix);directory.mkdir(mode=0o700);key=directory/'private.pem';public=directory/'public.pem'
 subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',str(key)],check=True,capture_output=True);key.chmod(0o600)
 der=subprocess.run(['openssl','pkey','-in',str(key),'-pubout','-outform','DER'],check=True,capture_output=True).stdout
 subprocess.run(['openssl','pkey','-in',str(key),'-pubout','-out',str(public)],check=True,capture_output=True)
 pkg='dev.acceptance.release'+suffix;appcode='release-'+suffix;base='http://127.0.0.1:48090/api/v1/app-updates';binary=b'TRANSPORT FIXTURE ONLY - NOT AN ANDROID APK\n'
 def ok(path,method='GET',data=None,**options):
  r=request('/admin-api/infra/app-release'+path,method,data,token=token,**options);assert r['code']==0,(path,r.get('code'),r.get('msg'));return r['data']
 def envelope(metadata):
  payload=json.dumps(metadata,ensure_ascii=False,separators=(',',':'));signature=subprocess.run(['openssl','dgst','-sha256','-sign',str(key)],input=payload.encode(),check=True,capture_output=True).stdout
  return {'payload':payload,'signature':base64.b64encode(signature).decode()}
 def signed_import(metadata,expected=0):
  r=request('/admin-api/infra/app-release/import','POST',{'applicationId':app,**envelope(metadata)},token=token);assert r['code']==expected,('import',r.get('code'),r.get('msg'));return r.get('data')
 def document(sequence,version=108,artifact=None):
  now=datetime.datetime.now(datetime.timezone.utc)
  return {'schemaVersion':2,'sequence':sequence,'issuedAt':now.isoformat().replace('+00:00','Z'),'expiresAt':(now+datetime.timedelta(days=14)).isoformat().replace('+00:00','Z'),'target':{'appId':appcode,'packageName':pkg,'platform':'android','architecture':'arm64-v8a','channel':'stable'},'release':None if version is None else {'id':'fixture-'+suffix,'appId':appcode,'platform':'android','architecture':'arm64-v8a','channel':'stable','versionCode':version,'versionName':'1.0.'+str(version),'publishedAt':now.isoformat().replace('+00:00','Z'),'notes':'验证公共更新能力','mandatory':False,'minBaseVersionCode':0,'artifact':artifact}}
 def public_status():
  try:r=urllib.request.urlopen(base+'/'+pkg+'/android/arm64-v8a/stable/manifest.json',timeout=10)
  except urllib.error.HTTPError as e:r=e
  return r.status,r.read(),r.headers
 legacy=LOCAL/'releases'/pkg/'android/arm64-v8a/stable/manifest.json';legacy.parent.mkdir(parents=True);legacy.write_text('{"legacyTransportFixture":true}')
 try:
  assert public_status()[0]==200
  app=ok('/application/save','POST',{'name':'版本验收'+suffix,'appId':appcode,'packageName':pkg,'publicKey':base64.b64encode(der).decode(),'artifactBaseUrl':base})
  assert any(a['id']==app for a in ok('/applications'));assert request('/admin-api/infra/app-release/applications',token=viewer)['code']==403;checks.append('独立应用登记及管理权限拒绝')
  artifact=ok('/artifact?applicationId='+str(app)+'&versionCode=108','POST',binary,content_type='application/octet-stream');assert artifact['sha256']==hashlib.sha256(binary).hexdigest() and artifact['bytes']==len(binary)
  req=urllib.request.Request(artifact['url'],headers={'Range':'bytes=0-8'});r=urllib.request.urlopen(req);assert r.status==206 and r.read()==binary[:9]
  checks.append('流式上传、不可变哈希地址及真实 Range 下载')
  assert json.loads(public_status()[1]).get('legacyTransportFixture') is True
  original=document(2,artifact=artifact);draft=signed_import(original);assert json.loads(public_status()[1]).get('legacyTransportFixture') is True;checks.append('登记与草稿保留旧清单，首次正式发布才切换托管')
  bad=envelope(original);bad['payload']+=' ';assert request('/admin-api/infra/app-release/import','POST',{'applicationId':app,**bad},token=token)['code']==400
  for change in ['expired','target']:
   invalid=copy.deepcopy(original);invalid['sequence']=20
   if change=='expired':invalid['expiresAt']='2000-01-01T00:00:00Z'
   else:invalid['target']['packageName']='dev.other'
   signed_import(invalid,400)
  checks.append('篡改签名、过期及错误应用目标拒绝')
  path=LOCAL/'releases'/pkg/'apk'/artifact['url'].split('/')[-1];path.write_bytes(b'x'*len(binary));assert request('/admin-api/infra/app-release/publish?id='+str(draft),'POST',token=token)['code']==400;path.write_bytes(binary)
  ok('/publish?id='+str(draft),'POST');status,body,headers=public_status();assert status==200 and json.loads(body)['payload']==envelope(original)['payload'] and 'no-store' in headers['Cache-Control'];checks.append('发布前复核安装包，发布后公开签名清单且不缓存旧清单')
  old=signed_import(document(1,artifact=artifact));assert request('/admin-api/infra/app-release/publish?id='+str(old),'POST',token=token)['code']==400
  renewal=signed_import(document(3,artifact=artifact));ok('/publish?id='+str(renewal),'POST');assert json.loads(json.loads(public_status()[1])['payload'])['sequence']==3;checks.append('序号回滚拒绝，原安装包同版本可签名续期')
  older=ok('/artifact?applicationId='+str(app)+'&versionCode=107','POST',binary,content_type='application/octet-stream');old=signed_import(document(4,107,older));assert request('/admin-api/infra/app-release/publish?id='+str(old),'POST',token=token)['code']==400
  alternate=ok('/artifact?applicationId='+str(app)+'&versionCode=108','POST',binary+b'changed',content_type='application/octet-stream');changed=signed_import(document(5,108,alternate));assert request('/admin-api/infra/app-release/publish?id='+str(changed),'POST',token=token)['code']==400;checks.append('版本降级和同版本偷换安装包拒绝')
  withdrawal=signed_import(document(6,None));ok('/publish?id='+str(withdrawal),'POST');assert json.loads(json.loads(public_status()[1])['payload'])['release'] is None;checks.append('更高序号的签名撤回，不伪造无签名空响应')
  sql('UPDATE infra_app_release SET expires_at=0 WHERE id='+str(withdrawal));assert public_status()[0]==410;checks.append('过期发布返回410，客户端不继续接受旧清单')
  page=ok('/list?applicationId='+str(app)+'&pageNo=1&pageSize=2');assert page['total']>=5 and len(page['list'])==2;checks.append('真实分页和完整发布历史')
  (LOCAL/'release-result.json').write_text(json.dumps({'passed':checks,'artifactScope':'transport bytes only; no APK built, signed or installed'},ensure_ascii=False,indent=2));print('版本发布接口验收通过：'+str(len(checks))+' 项')
 finally:
  if app:
   sql('DELETE FROM infra_app_release WHERE application_id='+str(app)+';DELETE FROM infra_release_application WHERE id='+str(app)+" AND app_id='"+appcode+"';")
   shutil.rmtree(LOCAL/'releases'/pkg,ignore_errors=True)
  shutil.rmtree(directory,ignore_errors=True)
if __name__=='__main__':main()
