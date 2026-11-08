from pathlib import Path
from environment import ROOT, LOCAL, environment
import subprocess, json, os, sys, time, urllib.request, shutil, zipfile, hashlib

env = environment()
with_payments = '--with-payments' in sys.argv
feature_file = LOCAL/'features.json'
def artifact_hash(file):
    if not file.is_file():return ''
    digest=hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
    return digest.hexdigest()
if not env.get('JAVA_HOME'):
    for home in ['/opt/homebrew/opt/openjdk@21','/opt/homebrew/opt/openjdk']:
        if (Path(home)/'bin/java').is_file(): env['JAVA_HOME']=home;break

compose = ['docker','compose','--project-name','container-acceptance','--env-file',str(LOCAL/'acceptance.env'),'-f',str(ROOT/'acceptance/compose.yaml')]
def run(cmd, **kwargs):
    subprocess.run(cmd,check=True,env=env,**kwargs)
def launch(name,cmd,cwd,extra=None):
    log=(LOCAL/(name+'.log')).open('wb')
    p=subprocess.Popen(cmd,cwd=cwd,env={**env,**(extra or {})},stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
    log.close();return p
def signature(pid):
    return subprocess.run(['ps','-p',str(pid),'-o','lstart='],capture_output=True,text=True).stdout.strip()
def login_ready():
    try:
        req=urllib.request.Request('http://127.0.0.1:48090/admin-api/system/auth/login',data=json.dumps({'username':env['CONTAINER_ADMIN_USER'],'password':env['CONTAINER_ADMIN_PASSWORD']}).encode(),headers={'Content-Type':'application/json','tenant-id':'1'})
        return json.load(urllib.request.urlopen(req,timeout=2)).get('code')==0
    except Exception:return False
def stop_processes():
    import signal
    file=LOCAL/'processes.json'
    if not file.exists():return
    for record in json.loads(file.read_text()).values():
        if isinstance(record,int):continue
        pid=record['pid']
        if signature(pid)!=record['started']:continue
        try:os.killpg(pid,signal.SIGTERM)
        except ProcessLookupError:pass
        # Wait for owned processes to exit before replacing a live Spring Boot archive.
        for _ in range(100):
            if signature(pid)!=record['started']:break
            time.sleep(.2)
        else:
            if signature(pid)==record['started']:
                try:os.killpg(pid,signal.SIGKILL)
                except ProcessLookupError:pass
    file.unlink()
if '--stop' in sys.argv:

    stop_processes()
    run(compose+['stop']);print('已停止本验收环境，数据保留');sys.exit()
if (LOCAL/'processes.json').exists():
    records=json.loads((LOCAL/'processes.json').read_text())
    if records and all(isinstance(record,dict) and signature(record['pid'])==record['started'] for record in records.values()) and login_ready() and feature_file.exists() and json.loads(feature_file.read_text()).get('payments')==with_payments and json.loads(feature_file.read_text()).get('backendSha256')==artifact_hash(ROOT/'backend/server/target/yudao-server.jar') and '--restart' not in sys.argv:
        print('验收环境已运行：PC 5188，Mobile 5190');sys.exit()
    stop_processes()
run(compose+['up','-d','--wait'])
if '--no-build' not in sys.argv:
    run(['mvn','-q','-DskipTests',*(['-Ppayments'] if with_payments else []),'package'],cwd=ROOT/'backend')
for folder in ['pc','mobile']:
    if not (ROOT/folder/'node_modules/.bin'/('uni' if folder=='mobile' else 'vite')).exists():run(['pnpm','install','--frozen-lockfile'],cwd=ROOT/folder)
with zipfile.ZipFile(ROOT/'backend/server/target/yudao-server.jar') as jar:
    bundled_payments=any('/yudao-module-pay-' in name for name in jar.namelist())
if bundled_payments != with_payments:
    raise RuntimeError('构建与启用的支付模块不一致，请去掉 --no-build 重新构建')
# Apply only common menu/dictionary metadata to this isolated acceptance database.
metadata=ROOT/'backend/sql/common-data.sql'
subprocess.run(['docker','exec','-i','-e','MYSQL_PWD','container-acceptance-mysql-1','mysql','--default-character-set=utf8mb4','-ucontainer','container'],input=metadata.read_text()+'\n'+(ROOT/'backend/sql/app-release.sql').read_text()+('\n'+(ROOT/'backend/sql/payments.sql').read_text() if with_payments else '')+'\n'+(ROOT/'backend/sql/menu-layout.sql').read_text()+('\nUPDATE system_menu SET status=0 WHERE id=114;' if with_payments else '\nUPDATE system_menu SET status=1 WHERE id=114;'),text=True,check=True,env={**env,'MYSQL_PWD':env['CONTAINER_DATABASE_PASSWORD']},capture_output=True)
subprocess.run(['docker','exec','-e','MYSQL_PWD','container-acceptance-mysql-1','mysql','--default-character-set=utf8mb4','-ucontainer','container','-e',"INSERT IGNORE INTO system_dept (id,name,parent_id,sort,status,tenant_id) SELECT 1,'默认部门',0,0,0,1 WHERE EXISTS (SELECT 1 FROM system_users); UPDATE system_users SET dept_id=1 WHERE id=1 AND dept_id IS NULL;"],check=True,env={**env,'MYSQL_PWD':env['CONTAINER_DATABASE_PASSWORD']},capture_output=True)
# Check only the isolated acceptance database; credentials never appear in argv/output.
query=['docker','exec','-e','MYSQL_PWD','container-acceptance-mysql-1','mysql','-ucontainer','-N','container','-e','SELECT COUNT(*) FROM system_users']
r=subprocess.run(query,check=True,env={**env,'MYSQL_PWD':env['CONTAINER_DATABASE_PASSWORD']},capture_output=True,text=True)
bootstrap=r.stdout.strip()=='0'
java = next((str(p) for p in [Path(env.get('JAVA_HOME','/nonexistent'))/'bin/java',Path('/opt/homebrew/opt/openjdk@21/bin/java'),Path('/opt/homebrew/opt/openjdk/bin/java')] if p.is_file()), 'java')
runtime=LOCAL/'runtime';runtime.mkdir(exist_ok=True)
shutil.copy2(ROOT/'backend/server/target/yudao-server.jar',runtime/'server.jar')
profiles=['container']+(['bootstrap'] if bootstrap else [])+(['payments'] if with_payments else [])
backend=[java,'-jar',str(runtime/'server.jar'),'--spring.profiles.active='+','.join(profiles)]
processes={}
try:
    p=launch('backend',backend,ROOT/'backend');processes['backend']=p.pid
    for _ in range(90):
        if p.poll() is not None:raise RuntimeError('后端启动失败，请查看 .local/backend.log')
        if login_ready():break
        time.sleep(1)
    else:raise RuntimeError('后端登录健康检查未通过，请查看 .local/backend.log')
    processes['module']=launch('module',[sys.executable,'-m','http.server','5200','--bind','127.0.0.1','--directory',str(ROOT/'acceptance/module')],ROOT).pid
    processes['pc']=launch('pc',['npm','run','dev','--','--strictPort'],ROOT/'pc').pid
    processes['mobile']=launch('mobile',['npm','run','dev:h5'],ROOT/'mobile').pid
    for address in ['http://127.0.0.1:5188/','http://127.0.0.1:5190/','http://127.0.0.1:5200/']:
        for _ in range(30):
            try:
                with urllib.request.urlopen(address,timeout=2) as response:
                    if response.status==200:break
            except Exception:pass
            time.sleep(1)
        else:raise RuntimeError('页面启动未通过：'+address)
    (LOCAL/'processes.json').write_text(json.dumps({name:{'pid':pid,'started':signature(pid)} for name,pid in processes.items()}))
    feature_file.write_text(json.dumps({'payments':with_payments,'backendSha256':artifact_hash(runtime/'server.jar')}))
    print('PC: http://127.0.0.1:5188/\nMobile: http://127.0.0.1:5190/\n账号见 container/.local/acceptance.env')
except Exception:
    import signal
    for pid in processes.values():
        try:os.killpg(pid,signal.SIGTERM)
        except ProcessLookupError:pass
    raise
