import sys,subprocess,time,urllib.request,json,uuid,shutil
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent));from environment import environment,ROOT,LOCAL,backend_profiles
env=environment();db='container_bootstrap_'+uuid.uuid4().hex[:8];proc=None;created=False;runtime=LOCAL/(db+'.jar')
rootenv={**env,'MYSQL_PWD':env['MYSQL_ROOT_PASSWORD']}
def sql(statement):
 result=subprocess.run(['docker','exec','-i','-e','MYSQL_PWD','container-acceptance-mysql-1','mysql','--default-character-set=utf8mb4','-uroot'],input=statement,text=True,env=rootenv,check=False,capture_output=True)
 if result.returncode:raise RuntimeError(result.stderr[-1200:])
 return result
try:
 sql('CREATE DATABASE '+db+' CHARACTER SET utf8mb4;');created=True
 shutil.copy2(ROOT/'backend/server/target/yudao-server.jar',runtime)
 sql('USE '+db+';\n'+(ROOT/'backend/sql/schema.sql').read_text()+(ROOT/'backend/sql/common-data.sql').read_text()+(ROOT/'backend/sql/menu-layout.sql').read_text()+((ROOT/'backend/sql/payments.sql').read_text() if 'payments' in backend_profiles() else ''))
 runenv={**env,'CONTAINER_DATABASE_USER':'root','CONTAINER_DATABASE_PASSWORD':env['MYSQL_ROOT_PASSWORD'],'CONTAINER_DATABASE_URL':env['CONTAINER_DATABASE_URL'].replace('/container?','/'+db+'?'),'CONTAINER_PORT':'48091','CONTAINER_REDIS_DATABASE':'1','CONTAINER_FILE_URL':'http://127.0.0.1:48091'}
 with (LOCAL/'bootstrap-check.log').open('w') as log:
  java=next((str(p) for p in [Path(env.get('JAVA_HOME','/nonexistent'))/'bin/java',Path('/opt/homebrew/opt/openjdk@21/bin/java'),Path('/opt/homebrew/opt/openjdk/bin/java')] if p.is_file()),'java')
  proc=subprocess.Popen([java,'-jar',str(runtime),'--spring.profiles.active='+backend_profiles('bootstrap')],env=runenv,stdout=log,stderr=subprocess.STDOUT)
  for _ in range(90):
   if proc.poll() is not None:raise RuntimeError('fresh bootstrap failed; inspect local log')
   try:
    req=urllib.request.Request('http://127.0.0.1:48091/admin-api/system/auth/login',data=json.dumps({'username':env['CONTAINER_ADMIN_USER'],'password':env['CONTAINER_ADMIN_PASSWORD']}).encode(),headers={'Content-Type':'application/json','tenant-id':'1'})
    res=json.load(urllib.request.urlopen(req,timeout=2))
    if res.get('code')==0:break
   except Exception:pass
   time.sleep(1)
  else:raise RuntimeError('bootstrap login timeout')
  result=sql('USE '+db+';SELECT dept_id FROM system_users WHERE id=1;SELECT COUNT(*) FROM system_menu;').stdout
  assert '\n1\n' in result and int(result.strip().splitlines()[-1])>80
  (LOCAL/'bootstrap-result.json').write_text(json.dumps({'passed':['独立空库导入、原菜单字典、事务初始化、默认部门与真实登录']},ensure_ascii=False,indent=2));print('全新数据库初始化与登录通过')
finally:
 if proc is not None:
  proc.terminate()
  try:proc.wait(timeout=20)
  except subprocess.TimeoutExpired:proc.kill();proc.wait()
 if created:sql('DROP DATABASE IF EXISTS '+db+';')
 runtime.unlink(missing_ok=True)
