from environment import environment,LOCAL
from api_check import login
import urllib.request,urllib.error,json

def main():
 token=login(environment()['CONTAINER_ADMIN_USER'])['accessToken']
 def call(path,origin,method='GET'):
  headers={'Origin':origin,'tenant-id':'1','Authorization':'Bearer '+token}
  if method=='OPTIONS':headers.update({'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization,tenant-id'})
  req=urllib.request.Request('http://127.0.0.1:48090'+path,headers=headers,method=method)
  try:r=urllib.request.urlopen(req,timeout=10)
  except urllib.error.HTTPError as error:r=error
  return r.status,r.headers,r.read()
 trusted='http://127.0.0.1:5190';untrusted='https://untrusted.invalid'
 for method in ['GET','OPTIONS']:assert call('/admin-api/system/user/profile/get',untrusted,method)[0]==403
 status,headers,body=call('/admin-api/system/user/profile/get',trusted);assert status==200 and json.loads(body)['code']==0 and headers['Access-Control-Allow-Origin']==trusted and headers.get('Access-Control-Allow-Credentials')!='true'
 assert call('/admin-api/system/user/profile/get',trusted,'OPTIONS')[0]==200
 for path in ['/admin/login','/druid/basic.json','/actuator/health']:
  for origin in [trusted,untrusted]:
   status=call(path,origin)[0];assert status==403,(path,origin,status)
 checks=['未登记来源的真实请求及预检拒绝','登记来源可用Token访问，跨域Cookie未授权','运维端点拒绝所有跨域来源，包括登记业务来源']
 (LOCAL/'cors-result.json').write_text(json.dumps({'passed':checks},ensure_ascii=False,indent=2));print('浏览器跨域边界验收通过：3 项')
if __name__=='__main__':main()
