"""Probe a separate backend and Redis DB; never change the running review server's quotas."""
from environment import environment,ROOT,LOCAL,backend_profiles
from pathlib import Path
import subprocess,urllib.request,urllib.error,socket,time,json,base64,os,shutil,uuid

def main():
 env=environment();runtime=LOCAL/('rate-probe-'+uuid.uuid4().hex+'.jar');shutil.copy2(ROOT/'backend/server/target/yudao-server.jar',runtime);sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close();proc=None
 java=next((str(p) for p in [Path(env.get('JAVA_HOME','/nonexistent'))/'bin/java',Path('/opt/homebrew/opt/openjdk@21/bin/java'),Path('/opt/homebrew/opt/openjdk/bin/java')] if p.is_file()),'java')
 def clear():
  r=subprocess.run(['docker','exec','container-acceptance-redis-1','redis-cli','-n','3','--scan','--pattern','*container-api:*'],capture_output=True,text=True,check=True)
  keys=r.stdout.splitlines()
  if keys:subprocess.run(['docker','exec','container-acceptance-redis-1','redis-cli','-n','3','DEL',*keys],capture_output=True,check=True)
 def call(path,index=0,basic=False):
  headers={'tenant-id':'1','Accept':'application/json','X-Forwarded-For':'198.51.100.'+str(index%250+1)}
  if basic:headers['Authorization']='Basic '+base64.b64encode((env['CONTAINER_MONITOR_USER']+':'+env['CONTAINER_MONITOR_PASSWORD']).encode()).decode()
  req=urllib.request.Request('http://127.0.0.1:'+str(port)+path,headers=headers)
  try:r=urllib.request.urlopen(req,timeout=2)
  except urllib.error.HTTPError as error:r=error
  return r.status,r.headers,r.read()
 clear()
 try:
  with (LOCAL/'rate-probe.log').open('w') as log:
   proc=subprocess.Popen([java,'-Xmx512m','-jar',str(runtime),'--spring.profiles.active='+backend_profiles(),'--container.security.login-per-minute=3','--container.security.api-per-minute=5','--spring.boot.admin.client.enabled=false','--logging.file.name='+str(LOCAL/'rate-probe-file.log')],env={**env,'CONTAINER_PORT':str(port),'CONTAINER_REDIS_DATABASE':'3'},stdout=log,stderr=subprocess.STDOUT)
   for _ in range(90):
    if proc.poll() is not None:raise RuntimeError('限流探测服务启动失败，请查看.local/rate-probe.log')
    try:
     if call('/actuator/health',basic=True)[0]==200:break
    except Exception:pass
    time.sleep(.2)
   else:raise RuntimeError('限流探测服务启动超时')
   for i in range(3):assert call('/admin-api/system/auth/get-permission-info?nonce='+str(i),i)[0]!=429
   status,headers,_=call('/admin-api/system/auth/get-permission-info?nonce=changed',200);assert status==429 and headers['Retry-After']=='60'
   assert call('/admin-api/system/auth/get-permission-info?nonce=another',201)[0]==429
   for i in range(5):assert call('/admin-api/system/user/page?pageNo=1&pageSize=10&nonce='+str(i),i)[0]!=429
   assert call('/admin-api/system/user/page?pageNo=1&pageSize=10&nonce=last',230)[0]==429
   (LOCAL/'rate-result.json').write_text(json.dumps({'passed':['认证与普通接口使用独立Redis限流桶','超限真实返回429及Retry-After','改变参数和伪造来源头不能重置限流'],'scope':'separate backend port and acceptance Redis DB 3'},ensure_ascii=False,indent=2));print('独立实例限流验收通过：3 项')
 finally:
  if proc:
   proc.terminate()
   try:proc.wait(timeout=20)
   except subprocess.TimeoutExpired:proc.kill();proc.wait()
  clear()
  runtime.unlink(missing_ok=True)
if __name__=='__main__':main()
