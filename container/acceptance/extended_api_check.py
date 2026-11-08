"""Real integration of restored infrastructure; external providers are never contacted."""
from environment import environment,LOCAL
from api_check import request,login,seed,sql
from urllib.parse import urlencode,urlsplit,parse_qs
import urllib.request,urllib.error,json,uuid,base64,socketserver,threading,time,email

env=environment()

def http(path,method='GET',data=None,token=None,basic=None,form=False):
 headers={'tenant-id':'1','Accept':'application/json'}
 if token:headers['Authorization']='Bearer '+token
 if basic:headers['Authorization']='Basic '+base64.b64encode((basic[0]+':'+basic[1]).encode()).decode()
 payload=None
 if data is not None:
  headers['Content-Type']='application/x-www-form-urlencoded' if form else 'application/json'
  payload=urlencode(data).encode() if form else json.dumps(data).encode()
 req=urllib.request.Request('http://127.0.0.1:48090'+path,method=method,data=payload,headers=headers)
 try:r=urllib.request.urlopen(req,timeout=15)
 except urllib.error.HTTPError as e:r=e
 body=r.read()
 try:result=json.loads(body)
 except ValueError:result=None
 return r.status,result

class SMTP(socketserver.StreamRequestHandler):
 def handle(self):
  self.wfile.write(b'220 local acceptance SMTP\r\n');self.wfile.flush();auth=0;data=False;content=[]
  while line:=self.rfile.readline(1024*1024):
   if data:
    if line==b'.\r\n':self.server.messages.append(b''.join(content));data=False;reply=b'250 queued\r\n'
    else:content.append(line);continue
   elif auth:
    if auth==1:auth=2;reply=b'334 UGFzc3dvcmQ6\r\n'
    else:auth=0;reply=b'235 authenticated\r\n'
   else:
    command=line.decode(errors='replace').strip().upper()
    if command.startswith(('EHLO','HELO')):reply=b'250-localhost\r\n250 AUTH LOGIN PLAIN\r\n'
    elif command.startswith('AUTH LOGIN'):auth=1;reply=b'334 VXNlcm5hbWU6\r\n'
    elif command.startswith('AUTH PLAIN'):reply=b'235 authenticated\r\n'
    elif command.startswith('DATA'):data=True;content=[];reply=b'354 send data\r\n'
    elif command.startswith('QUIT'):self.wfile.write(b'221 bye\r\n');return
    else:reply=b'250 ok\r\n'
   self.wfile.write(reply);self.wfile.flush()

def main():
 seed();token=login(env['CONTAINER_ADMIN_USER'])['accessToken'];viewer=login('viewer')['accessToken'];suffix=uuid.uuid4().hex[:8];owned=[];checks=[]
 def ok(path,method='GET',data=None):
  _,r=http('/admin-api'+path,method,data,token);assert r and r.get('code')==0,(path,None if r is None else r.get('code'));return r['data']
 def create(kind,data):
  identifier=ok('/system/'+kind+'/create','POST',data);owned.append((kind,identifier));return identifier
 smtp=socketserver.ThreadingTCPServer(('127.0.0.1',0),SMTP);smtp.messages=[];thread=threading.Thread(target=smtp.serve_forever,daemon=True);thread.start()
 try:
  for kind in ['sms-channel','sms-template','sms-log','mail-account','mail-template','mail-log','social-client','social-user','oauth2-client']:
   ok('/system/'+kind+'/page?pageNo=1&pageSize=10');assert request('/admin-api/system/'+kind+'/page?pageNo=1&pageSize=10',token=viewer)['code']==403,kind
  checks.append('新增管理接口原权限保留，未授权用户逐项被拒绝')
  channel=create('sms-channel',{'signature':'扩展验收'+suffix,'code':'DEBUG_DING_TALK','status':0,'apiKey':'acceptance-disabled','apiSecret':'fixture-secret','remark':'extension-check'})
  template=create('sms-template',{'type':1,'status':1,'code':'extension-sms-'+suffix,'name':'验收禁用短信','content':'hello {name}','apiTemplateId':'disabled-fixture','channelId':channel})
  logid=ok('/system/sms-template/send-sms','POST',{'mobile':'13800000000','templateCode':'extension-sms-'+suffix,'templateParams':{'name':'fixture'}})
  assert ok('/system/sms-log/get?id='+str(logid))['sendStatus']==30
  checks.append('短信渠道模板真实保存，禁用发送仅记日志且不调用外部服务')
  account=create('mail-account',{'mail':'sender@example.invalid','username':'fixture','password':'fixture-only-password','host':'127.0.0.1','port':smtp.server_address[1],'sslEnable':False,'starttlsEnable':False})
  mail=create('mail-template',{'code':'extension-mail-'+suffix,'name':'扩展验收邮件','accountId':account,'nickname':'Container','title':'extension-'+suffix,'content':'<p>hello {name}</p>','status':0})
  logid=ok('/system/mail-template/send-mail','POST',{'toMails':['receiver@example.invalid'],'ccMails':[],'bccMails':[],'templateCode':'extension-mail-'+suffix,'templateParams':{'name':suffix}})
  for _ in range(50):
   log=ok('/system/mail-log/get?id='+str(logid))
   if log['sendStatus']!=0:break
   time.sleep(.1)
  assert log['sendStatus']==10 and len(smtp.messages)==1
  parsed=email.message_from_bytes(smtp.messages[0]);assert parsed['Subject']=='extension-'+suffix
  checks.append('邮件账户模板及异步 SMTP 真实投递到本机收件器，日志成功')
  client=create('social-client',{'name':'扩展认证'+suffix,'socialType':20,'userType':2,'clientId':'fixture-'+suffix,'clientSecret':'fixture-secret','status':1})
  assert ok('/system/social-client/get?id='+str(client))['name']=='扩展认证'+suffix
  checks.append('三方认证配置真实保存读取，不伪造外部平台登录成功')
  tree=ok('/system/area/tree');assert len(tree)>30 and any(x['name']=='北京市' for x in tree)
  checks.append('原地区树使用本地真实数据')
  basic=(env['CONTAINER_MONITOR_USER'],env['CONTAINER_MONITOR_PASSWORD'])
  for path in ['/admin/instances','/actuator/metrics','/druid/basic.json']:
   status,r=http(path);assert status in [401,403],(path,status)
   status,r=http(path,basic=basic);assert status==200,(path,status)
  assert http('/admin-api/system/user/page?pageNo=1&pageSize=10',basic=basic)[1]['code']==401
  assert http('/actuator/metrics',token=token)[0] in [401,403]
  instances=http('/admin/instances',basic=basic)[1];assert len(instances)>=1
  assert any(x.get('statusInfo',{}).get('status')=='UP' for x in instances)
  checks.append('监控独立认证，匿名访问拒绝，真实服务实例为 UP')
  oauthid='extension-'+suffix;secret='fixture-secret-'+suffix;redirect='http://127.0.0.1:5200/callback'
  create('oauth2-client',{'clientId':oauthid,'secret':secret,'name':'扩展应用','logo':'https://example.invalid/logo.svg','status':0,'accessTokenValiditySeconds':300,'refreshTokenValiditySeconds':600,'redirectUris':[redirect],'authorizedGrantTypes':['authorization_code','refresh_token'],'scopes':['user_info'],'autoApproveScopes':[]})
  params={'response_type':'code','client_id':oauthid,'scope':json.dumps({'user_info':True}),'redirect_uri':redirect,'auto_approve':'false','state':suffix}
  _,r=http('/admin-api/system/oauth2/authorize','POST',params,token=token,form=True);assert r['code']==0,r.get('code');query=parse_qs(urlsplit(r['data']).query);assert query['state']==[suffix];code=query['code'][0]
  bad={**params,'redirect_uri':redirect+'-unregistered'};assert http('/admin-api/system/oauth2/authorize','POST',bad,token=token,form=True)[1]['code']!=0
  token_params={'grant_type':'authorization_code','code':code,'redirect_uri':redirect,'state':suffix};_,issued=http('/admin-api/system/oauth2/token','POST',token_params,basic=(oauthid,secret),form=True);assert issued['code']==0,issued.get('code')
  assert http('/admin-api/system/oauth2/token','POST',token_params,basic=(oauthid,secret),form=True)[1]['code']!=0
  checks.append('原 OAuth2 授权码换取独立应用令牌，错误回调及授权码重放被拒绝')
  (LOCAL/'extended-api-result.json').write_text(json.dumps({'passed':checks},ensure_ascii=False,indent=2));print('扩展公共接口验收通过：'+str(len(checks))+' 项')
 finally:
  for kind,identifier in reversed(owned):
   result=request('/admin-api/system/'+kind+'/delete?id='+str(identifier),'DELETE',token=token)
   assert result['code']==0,(kind,'cleanup',result['code'])
  smtp.shutdown();smtp.server_close()
if __name__=='__main__':main()
