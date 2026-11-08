from pathlib import Path
import os, secrets, json
ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local'
LOCAL.mkdir(exist_ok=True)
def environment():
    file = LOCAL / 'acceptance.env'
    if not file.exists():
        values = {'MYSQL_ROOT_PASSWORD':secrets.token_hex(24),'CONTAINER_DATABASE_PASSWORD':secrets.token_hex(24),
            'CONTAINER_ADMIN_USER':'containeradmin','CONTAINER_ADMIN_PASSWORD':secrets.token_hex(8)}
        file.write_text(''.join(f'{k}={v}\n' for k,v in values.items())); file.chmod(0o600)
    values = dict(line.split('=',1) for line in file.read_text().splitlines() if '=' in line)
    if 'CONTAINER_MONITOR_PASSWORD' not in values:
        values.update(CONTAINER_MONITOR_USER='monitor',CONTAINER_MONITOR_PASSWORD=secrets.token_hex(16))
        file.write_text(''.join(f'{k}={v}\n' for k,v in values.items()))
    file.chmod(0o600)
    login=LOCAL/'login.txt'
    login.write_text('PC: http://127.0.0.1:5188/\nMobile: http://127.0.0.1:5190/\n账号: '+values['CONTAINER_ADMIN_USER']+'\n密码: '+values['CONTAINER_ADMIN_PASSWORD']+'\n监控账号: '+values['CONTAINER_MONITOR_USER']+'\n监控密码: '+values['CONTAINER_MONITOR_PASSWORD']+'\n仅用于本机隔离验收环境。\n')
    login.chmod(0o600)
    base={key:value for key,value in os.environ.items() if not key.startswith(('SPRING_','CONTAINER_','VITE_','MYSQL_','REDIS_'))}
    nodes=sorted((Path.home()/'.nvm/versions/node').glob('v*/bin'),key=lambda p:tuple(int(x) for x in p.parent.name[1:].split('.')),reverse=True)
    if nodes:base['PATH']=str(nodes[0])+os.pathsep+base.get('PATH','')
    return {**base,**values,'CONTAINER_LOGIN_RATE_LIMIT':'1000','CONTAINER_API_RATE_LIMIT':'10000','CONTAINER_CAPTCHA_ENABLED':'false','CONTAINER_PORT':'48090','CONTAINER_REDIS_HOST':'127.0.0.1','CONTAINER_RELEASE_ROOT':str(LOCAL/'releases'),'CONTAINER_RELEASE_ALLOW_HTTP':'true','VITE_CONTAINER_API_URL':'','CONTAINER_DATABASE_URL':'jdbc:mysql://127.0.0.1:23316/container?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai',
      'CONTAINER_DATABASE_USER':'container','CONTAINER_REDIS_PORT':'23379','CONTAINER_REDIS_DATABASE':'0','CONTAINER_FILE_URL':'http://127.0.0.1:48090'}
if __name__=='__main__':
    environment()
    print('acceptance凭据已保存在 container/.local/acceptance.env（仅本机可读）')


def backend_profiles(*extra):
    import zipfile
    with zipfile.ZipFile(ROOT/'backend/server/target/yudao-server.jar') as jar:
        payments=any('/yudao-module-pay-' in name for name in jar.namelist())
    return ','.join(['container',*extra]+(['payments'] if payments else []))
