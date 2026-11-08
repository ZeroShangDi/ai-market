"""Real HTTPS/mTLS and OAuth application-boundary verification with local test certificates."""
from environment import environment,ROOT,LOCAL
from api_check import request,login,seed,sql
from extended_api_check import http
from urllib.parse import urlencode,urlsplit,parse_qs
import subprocess,ssl,socket,urllib.request,urllib.error,base64,uuid,json,os,shutil,time
from http.cookiejar import CookieJar

def main():
 env=environment();seed();token=login(env['CONTAINER_ADMIN_USER'])['accessToken'];suffix=uuid.uuid4().hex[:8];client_id='gateway-'+suffix;other_id='gateway-other-'+suffix;owned=[];checks=[];name='container-tls-'+suffix
 folder=LOCAL/('tls-'+suffix);folder.mkdir(mode=0o700);container=False
 def run(args):return subprocess.run(args,check=True,capture_output=True,text=True)
 def create(identifier,scopes):
  data={'clientId':identifier,'secret':'fixture-secret','name':'网关验收','logo':'https://example.invalid/logo.svg','status':0,'accessTokenValiditySeconds':300,'refreshTokenValiditySeconds':600,'redirectUris':['http://127.0.0.1:5200/'],'authorizedGrantTypes':['authorization_code'],'scopes':scopes,'autoApproveScopes':[]}
  r=request('/admin-api/system/oauth2-client/create','POST',data,token=token);assert r['code']==0;r_id=r['data'];owned.append(r_id);data['id']=r_id
  params={'response_type':'code','client_id':identifier,'scope':json.dumps({scope:True for scope in scopes}),'redirect_uri':'http://127.0.0.1:5200/','auto_approve':'false','state':suffix}
  r=http('/admin-api/system/oauth2/authorize','POST',params,token=token,form=True)[1];assert r['code']==0;code=parse_qs(urlsplit(r['data']).query)['code'][0]
  r=http('/admin-api/system/oauth2/token','POST',{'grant_type':'authorization_code','code':code,'redirect_uri':'http://127.0.0.1:5200/','state':suffix},basic=(identifier,'fixture-secret'),form=True)[1];assert r['code']==0;return r['data']['access_token'],data
 def certificate(label,server=False):
  key=folder/(label+'.key');csr=folder/(label+'.csr');crt=folder/(label+'.crt');ext=folder/(label+'.ext')
  run(['openssl','req','-new','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(csr),'-subj','/CN='+label])
  ext.write_text('basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\nextendedKeyUsage='+('serverAuth' if server else 'clientAuth')+'\n'+('subjectAltName=DNS:services.foundation.example,DNS:admin.foundation.example\n' if server else ''))
  run(['openssl','x509','-req','-in',str(csr),'-CA',str(folder/'apps-ca.crt'),'-CAkey',str(folder/'apps-ca.key'),'-CAcreateserial','-out',str(crt),'-days','1','-sha256','-extfile',str(ext)]);key.chmod(0o600)
  raw=run(['openssl','x509','-in',str(crt),'-noout','-fingerprint','-sha1']).stdout.strip().split('=')[-1].replace(':','');return raw
 try:
  access,application=create(client_id,['user.read','config.read']);other,_=create(other_id,['user.read'])
  assert request('/admin-api/system/user/page?pageNo=1&pageSize=10',token=access)['code']==403
  assert request('/admin-api/system/user/profile/get',token=access)['code']==0
  assert request('/admin-api/infra/config/get-value-by-key?key=container.acceptance',token=other)['code']==403
  assert request('/admin-api/infra/config/get-value-by-key?key=container.private',token=access)['code']!=0
  checks.append('应用scope与用户权限同时生效，不能继承管理权限或读取私有配置')
  application['status']=1;assert request('/admin-api/system/oauth2-client/update','PUT',application,token=token)['code']==0;assert request('/admin-api/system/user/profile/get',token=access)['code']==403
  application['status']=0;assert request('/admin-api/system/oauth2-client/update','PUT',application,token=token)['code']==0;checks.append('停用应用后已有应用令牌不再访问公共数据')
  (folder/'ca.cnf').write_text('[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\nCN=Container Acceptance CA\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always\n')
  run(['openssl','req','-config',str(folder/'ca.cnf'),'-x509','-newkey','rsa:2048','-nodes','-keyout',str(folder/'apps-ca.key'),'-out',str(folder/'apps-ca.crt'),'-subj','/CN=Container Acceptance CA','-days','1','-sha256']);(folder/'apps-ca.key').chmod(0o600)
  certificate('server',True);fingerprint=certificate('approved');other_fingerprint=certificate('other');certificate('unregistered')
  (folder/'approved-apps.map').write_text('"'+fingerprint+'" "'+client_id+'";\n"'+other_fingerprint+'" "'+other_id+'";\n')
  config=(ROOT/'deploy/nginx.conf').read_text().replace('worker_processes auto;', 'worker_processes 1;\nerror_log /dev/stderr info;').replace('server 127.0.0.1:48090','server host.docker.internal:48090');(folder/'nginx.conf').write_text(config)
  mounts=['-v',str(folder/'nginx.conf')+':/etc/nginx/nginx.conf:ro','-v',str(folder)+':/etc/nginx/tls:ro','-v',str(folder/'approved-apps.map')+':/etc/nginx/approved-apps.map:ro','-v',str(ROOT/'pc/dist')+':/srv/container/pc/dist:ro']
  run(['docker','run','--rm',*mounts,'docker.m.daocloud.io/nginx:1.27-alpine','nginx','-t'])
  run(['openssl','verify','-x509_strict','-CAfile',str(folder/'apps-ca.crt'),str(folder/'server.crt'),str(folder/'approved.crt')])
  run(['docker','run','-d','--name',name,'-p','127.0.0.1:5443:443',*mounts,'docker.m.daocloud.io/nginx:1.27-alpine']);container=True
  original=socket.getaddrinfo
  def resolve(host,port,*args,**kwargs):return original('127.0.0.1' if host in ['services.foundation.example','admin.foundation.example'] else host,port,*args,**kwargs)
  socket.getaddrinfo=resolve
  def call(label=None,bearer=access,extra=None):
   context=ssl.create_default_context(cafile=str(folder/'apps-ca.crt'))
   if label:context.load_cert_chain(str(folder/(label+'.crt')),str(folder/(label+'.key')))
   opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPSHandler(context=context))
   req=urllib.request.Request('https://services.foundation.example:5443/service-api/system/user/profile/get',headers={'tenant-id':'1','Authorization':'Bearer '+bearer,**(extra or {})})
   try:
    r=opener.open(req,timeout=10);return r.status,json.load(r)
   except urllib.error.HTTPError as error:return error.code,None
   except (ssl.SSLError,urllib.error.URLError) as error:
    (LOCAL/'gateway-tls-error.txt').write_text(str(getattr(error,'reason',error)));return 0,None
  try:
   for _ in range(30):
    try:
     socket.create_connection(('127.0.0.1',5443),timeout=1).close();break
    except OSError:time.sleep(.1)
   ready=None
   for _ in range(50):
    ready=call('approved')
    if ready[0]==200 and ready[1].get('code')==0:break
    time.sleep(.2)
   else:raise AssertionError(('TLS gateway readiness',ready[0]))
   assert call()[0] in [0,400,403,495,496]
   probe=subprocess.run(['openssl','s_client','-connect','127.0.0.1:5443','-servername','services.foundation.example','-CAfile',str(folder/'apps-ca.crt'),'-cert',str(folder/'approved.crt'),'-key',str(folder/'approved.key'),'-quiet'],input='GET /service-api/system/user/profile/get HTTP/1.1\r\nHost: services.foundation.example\r\nConnection: close\r\n\r\n',capture_output=True,text=True,timeout=15);(LOCAL/'gateway-openssl.log').write_text(probe.stdout[:1000]+probe.stderr[-1000:])
   unregistered=call('unregistered');assert unregistered[0]==403,('unregistered',unregistered[0],(LOCAL/'gateway-tls-error.txt').read_text() if (LOCAL/'gateway-tls-error.txt').exists() else '')
   approved=call('approved');assert approved[0]==200 and approved[1]['code']==0,('approved',approved[0])
   assert call('other')[0]==403
   assert call('approved',extra={'X-Container-App':other_id})[0]==200
   checks.extend(['真实TLS与服务器证书校验通过','无客户端证书和未登记证书拒绝','证书映射应用与令牌clientId必须匹配，伪造请求头被网关覆盖'])
   # Establish a genuine monitor session, then ensure the TLS Token API cannot rotate it.
   jar=CookieJar();monitor=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(jar))
   monitor.open('http://127.0.0.1:48090/admin/login',timeout=10).read()
   csrf=next(c.value for c in jar if c.name=='XSRF-TOKEN')
   monitor.open(urllib.request.Request('http://127.0.0.1:48090/admin/login',data=urlencode({'username':env['CONTAINER_MONITOR_USER'],'password':env['CONTAINER_MONITOR_PASSWORD'],'_csrf':csrf}).encode()),timeout=10).read()
   session=next(c.value for c in jar if c.name=='JSESSIONID')
   assert monitor.open('http://127.0.0.1:48090/druid/basic.json',timeout=10).status==200
   public=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=str(folder/'apps-ca.crt'))))
   for _ in range(4):
    r=public.open(urllib.request.Request('https://admin.foundation.example:5443/admin-api/system/user/profile/get',headers={'Authorization':'Bearer '+token,'tenant-id':'1','Cookie':'JSESSIONID='+session}),timeout=10)
    assert json.load(r)['code']==0 and not r.headers.get('Set-Cookie')
   assert monitor.open('http://127.0.0.1:48090/druid/basic.json',timeout=10).status==200
   checks.append('HTTPS业务接口隔离Cookie，真实监控会话不被业务请求轮换')
  finally:socket.getaddrinfo=original
  (LOCAL/'gateway-result.json').write_text(json.dumps({'passed':checks},ensure_ascii=False,indent=2));print('HTTPS、应用授权和mTLS验收通过：'+str(len(checks))+' 项')
 finally:
  if container:
   logs=subprocess.run(['docker','logs',name],capture_output=True,text=True);(LOCAL/'gateway-nginx.log').write_text(logs.stdout+logs.stderr)
   subprocess.run(['docker','rm','-f',name],capture_output=True)
  for identifier in owned:
   request('/admin-api/system/oauth2-client/delete?id='+str(identifier),'DELETE',token=token)
  sql("DELETE FROM system_oauth2_access_token WHERE client_id IN ('"+client_id+"','"+other_id+"');DELETE FROM system_oauth2_refresh_token WHERE client_id IN ('"+client_id+"','"+other_id+"');")
  shutil.rmtree(folder,ignore_errors=True)
if __name__=='__main__':main()
