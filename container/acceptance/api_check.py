from environment import ROOT, LOCAL, environment
import json, urllib.request, urllib.error, subprocess, uuid

env=environment();base='http://127.0.0.1:48090'
def sql(statement):
    subprocess.run(['docker','exec','-e','MYSQL_PWD','container-acceptance-mysql-1','mysql','--default-character-set=utf8mb4','-ucontainer','container','-e',statement],check=True,env={**env,'MYSQL_PWD':env['CONTAINER_DATABASE_PASSWORD']},capture_output=True,text=True)
def request(path,method='GET',data=None,token=None,raw=False,content_type='application/json'):
    headers={'tenant-id':'1','Content-Type':content_type}
    if token:headers['Authorization']='Bearer '+token
    payload=data if isinstance(data,bytes) else json.dumps(data).encode() if data is not None else None
    req=urllib.request.Request(base+path,method=method,data=payload,headers=headers)
    try:r=urllib.request.urlopen(req,timeout=15)
    except urllib.error.HTTPError as e:r=e
    body=r.read()
    return body if raw else json.loads(body)
def login(user):
    r=request('/admin-api/system/auth/login','POST',{'username':user,'password':env['CONTAINER_ADMIN_PASSWORD']})
    assert r['code']==0,('login',r.get('code'));return r['data']
def seed():
    sql("""INSERT INTO system_users (id,username,password,nickname,tenant_id,post_ids) SELECT 2,'viewer',password,'只读验收用户',1,'[]' FROM system_users WHERE id=1 AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM system_users WHERE id=2) t);
    UPDATE system_users SET nickname='只读验收用户' WHERE id=2;
    INSERT INTO infra_config (id,category,type,name,config_key,value,visible) VALUES (100001,'container',2,'验收配置','container.acceptance','公共配置读取成功',1) ON DUPLICATE KEY UPDATE value='公共配置读取成功';
    INSERT INTO infra_config (id,category,type,name,config_key,value,visible) VALUES (100002,'container',2,'非公开配置','container.private','not-for-client',0) ON DUPLICATE KEY UPDATE visible=0;
    INSERT INTO system_menu (id,name,permission,type,sort,parent_id,path,icon,status,visible,keep_alive,always_show) VALUES (100000,'验收示例','',2,999,0,'http://127.0.0.1:5200/?_iframe=1','ep:box',0,1,0,1) ON DUPLICATE KEY UPDATE deleted=0,visible=1;
    INSERT INTO system_notify_message (id,user_id,user_type,template_id,template_code,template_nickname,template_content,template_type,template_params,read_status,tenant_id) VALUES (100001,1,2,1,'acceptance','验收','欢迎验收公共通知',1,'{}',0,1),(100002,2,2,1,'acceptance','验收','其他用户私有通知',1,'{}',0,1) ON DUPLICATE KEY UPDATE read_status=0,template_content=VALUES(template_content),tenant_id=VALUES(tenant_id);""")
def main():
    seed();checks=[]
    admin=login(env['CONTAINER_ADMIN_USER']);token=admin['accessToken'];viewer=login('viewer')['accessToken'];checks.append('真实账号登录')
    assert request('/admin-api/system/auth/get-permission-info',token=token)['data']['user']['id']==1
    assert request('/admin-api/system/user/page?pageNo=1&pageSize=10',token=viewer)['code']==403;checks.append('服务端权限拒绝')
    assert request('/admin-api/infra/config/get-value-by-key?key=container.acceptance',token=token)['data']=='公共配置读取成功';assert request('/admin-api/infra/config/get-value-by-key?key=container.private',token=token)['code'] != 0;checks.append('公共配置与私有配置拒绝')
    boundary='container'+uuid.uuid4().hex;content=b'container acceptance file\n'
    payload=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="acceptance.txt"\r\nContent-Type: text/plain\r\n\r\n'.encode()+content+f'\r\n--{boundary}--\r\n'.encode())
    result=request('/admin-api/infra/file/upload','POST',payload,token=token,content_type='multipart/form-data; boundary='+boundary)
    assert result['code']==0,('upload',result.get('code'));url=result['data'];assert url.startswith(base+'/admin-api/infra/file/')
    assert urllib.request.urlopen(url,timeout=10).read()==content;checks.append('真实文件上传与下载字节一致')
    notices=request('/admin-api/system/notify-message/my-page?pageNo=1&pageSize=20',token=token)['data']['list']
    assert any(n['id']==100001 for n in notices) and all(n['userId']==1 for n in notices)
    assert request('/admin-api/system/notify-message/update-read?ids=100001','PUT',token=token)['code']==0
    assert request('/admin-api/system/notify-message/update-read?ids=100002','PUT',token=token)['code']==0
    other=request('/admin-api/system/notify-message/my-page?pageNo=1&pageSize=20',token=viewer)['data']['list']
    assert next(n for n in other if n['id']==100002)['readStatus'] is False;checks.append('通知已读与用户隔离')
    refreshed=request('/admin-api/system/auth/refresh-token?refreshToken='+admin['refreshToken'],'POST')
    assert refreshed['code']==0;new=refreshed['data']['accessToken'];checks.append('令牌刷新')
    assert request('/admin-api/system/auth/logout','POST',token=new)['code']==0
    assert request('/admin-api/system/auth/get-permission-info',token=new)['code']==401;checks.append('退出后令牌失效')
    (LOCAL/'api-result.json').write_text(json.dumps({'passed':checks},ensure_ascii=False,indent=2))
    print('API 验收通过：'+str(len(checks))+' 项')
if __name__=='__main__':main()
