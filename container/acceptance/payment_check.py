"""Optional module: real configuration/records/boundaries; never contact a payment provider."""
from environment import environment,LOCAL
from api_check import request,login,seed,sql
from extended_api_check import http
import json,uuid,urllib.request,urllib.error

def tenant_request(path,method="GET",data=None,token=None,tenant=1):
 headers={"Content-Type":"application/json","tenant-id":str(tenant)}
 if token:headers["Authorization"]="Bearer "+token
 req=urllib.request.Request("http://127.0.0.1:48090"+path,method=method,data=json.dumps(data).encode() if data is not None else None,headers=headers)
 try:r=urllib.request.urlopen(req,timeout=15)
 except urllib.error.HTTPError as e:r=e
 return json.load(r)

def main():
 env=environment();seed();token=login(env['CONTAINER_ADMIN_USER'])['accessToken'];viewer=login('viewer')['accessToken'];suffix=uuid.uuid4().hex[:8];apps=[];channels=[];checks=[]
 def call(path,method='GET',data=None):return request('/admin-api/pay'+path,method,data,token=token)
 def ok(path,method='GET',data=None):
  result=call(path,method,data);assert result['code']==0,(path,result.get('msg'));return result['data']
 try:
  for path in ['/app/page','/order/page','/refund/page','/notify/page']:
   ok(path+'?pageNo=1&pageSize=10');assert request('/admin-api/pay'+path+'?pageNo=1&pageSize=10',token=viewer)['code']==403
  checks.append('原支付应用、支付单、退款单、通知记录接口与权限可用')
  for index in range(2):apps.append(ok('/app/create','POST',{'appKey':'acceptance-pay-'+suffix+str(index),'name':'支付隔离验收'+str(index),'status':1,'orderNotifyUrl':'https://example.invalid/pay','refundNotifyUrl':'https://example.invalid/refund'}))
  for index,app in enumerate(apps):
   config={'appId':'acceptance-'+str(index),'mchId':'fixture-merchant-'+str(index),'apiVersion':'v2','mchKey':'not-a-real-merchant-key','keyContent':'not-a-real-certificate'}
   channels.append(ok('/channel/create','POST',{'appId':app,'code':'wx_app','status':1,'feeRate':0,'config':json.dumps(config)}))
  a=ok('/channel/get?id='+str(channels[0]));b=ok('/channel/get?id='+str(channels[1]));assert a['appId']!=b['appId'] and a['config']!=b['config'];checks.append('各应用独立渠道商户配置，无共享默认商户')
  assert call('/channel/update','PUT',{'id':channels[0],'appId':apps[1],'status':1,'feeRate':0,'config':a['config']})['code']==400
  assert call('/channel/create','POST',{'appId':999999999,'code':'wx_app','status':1,'feeRate':0,'config':a['config']})['code']!=0
  assert call('/app/delete?id='+str(apps[0]),'DELETE')['code']==400
  checks.append('渠道不能改绑应用，不存在的应用拒绝，关联渠道阻止误删')
  assert call('/channel/create','POST',{'appId':apps[0],'code':'mock','status':1,'feeRate':0,'config':'{}'})['code']==400
  status,result=http('/admin-api/pay/order/submit','POST',{'id':1},token);assert status==503 and result['code']==503
  status,result=http('/admin-api/pay/notify/order/1','POST',{'fixture':True});assert status in [401,503] or result and result.get('code') in [401,503]
  assert request('/admin-api/pay/wallet/get?id=1',token=token)['code']!=0
  checks.append('模拟渠道拒绝，资金动作关闭，钱包与转账无公开入口')
  # Read isolation from the actual tenant interceptor, not a client-side filter.
  tenant=880000+int(suffix[:4],16);user=tenant
  sql(f"INSERT INTO system_tenant (id,name,contact_user_id,contact_name,package_id,expire_time,account_count,websites) VALUES ({tenant},'payboundary{suffix}',{user},'验收',0,'2099-01-01',10,'[]'); INSERT INTO system_users (id,username,password,nickname,status,tenant_id) SELECT {user},'payboundary{suffix}',password,'验收',0,{tenant} FROM system_users WHERE id=1; INSERT INTO system_role (id,name,code,sort,data_scope,status,type,tenant_id) VALUES ({tenant},'验收','super_admin',0,1,0,1,{tenant}); INSERT INTO system_user_role(user_id,role_id,tenant_id) VALUES({user},{tenant},{tenant});")
  try:
   other=tenant_request('/admin-api/system/auth/login','POST',{'username':'payboundary'+suffix,'password':env['CONTAINER_ADMIN_PASSWORD']},tenant=tenant)['data']['accessToken']
   assert tenant_request('/admin-api/pay/app/get?id='+str(apps[0]),token=other,tenant=tenant).get('data') is None
   assert tenant_request('/admin-api/pay/channel/get?id='+str(channels[0]),token=other,tenant=tenant).get('data') is None
   checks.append('跨租户读取支付应用及渠道被数据层隔离')
  finally:
   for table,key in [('system_oauth2_access_token','tenant_id'),('system_oauth2_refresh_token','tenant_id'),('system_user_role','tenant_id'),('system_role','tenant_id'),('system_users','tenant_id')]:sql(f'DELETE FROM {table} WHERE {key}={tenant};')
   sql(f'DELETE FROM system_tenant WHERE id={tenant};')
  (LOCAL/'payment-result.json').write_text(json.dumps({'passed':checks,'fundsEnabled':False,'externalProviderCalled':False},ensure_ascii=False,indent=2));print('支付配置与边界验收通过：'+str(len(checks))+' 项')
 finally:
  for identifier in channels:ok('/channel/delete?id='+str(identifier),'DELETE')
  for identifier in apps:ok('/app/delete?id='+str(identifier),'DELETE')
if __name__=='__main__':main()
