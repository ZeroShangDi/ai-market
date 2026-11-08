"""Apply navigation migration twice; verify grouping, intact leaves and existing scoped grants."""
from environment import ROOT,LOCAL,environment
from api_check import request,login,sql
import subprocess,json,uuid

def main():
 env=environment();token=login(env['CONTAINER_ADMIN_USER'])['accessToken'];suffix=uuid.uuid4().hex[:8];fixture=960000+int(suffix[:5],16)
 def menus():
  result=request('/admin-api/system/menu/list',token=token);assert result['code']==0;return {m['id']:m for m in result['data']}
 def query(statement):
  result=subprocess.run(['docker','exec','-e','MYSQL_PWD','container-acceptance-mysql-1','mysql','--default-character-set=utf8mb4','-N','-B','-ucontainer','container','-e',statement],env={**env,'MYSQL_PWD':env['CONTAINER_DATABASE_PASSWORD']},check=True,capture_output=True,text=True);return result.stdout.strip()
 before=menus();baseline={i:{k:m.get(k) for k in ['permission','component','componentName','type','status','visible']} for i,m in before.items()};pay={i:m for i,m in before.items() if i==114 or m.get('parentId')==114};checks=[]
 # A role/package which previously had OAuth only must gain folders, not unrelated services.
 sql(f"INSERT INTO system_role(id,name,code,sort,status,type,tenant_id) VALUES({fixture},'菜单迁移验收','menulayout{suffix}',1,0,2,1); INSERT INTO system_role_menu(role_id,menu_id,tenant_id) VALUES({fixture},1,1),({fixture},201,1),({fixture},202,1); INSERT INTO system_tenant_package(id,name,status,menu_ids) VALUES({fixture},'menulayout{suffix}',0,'[1,201,202]');")
 try:
  migration=(ROOT/'backend/sql/menu-layout.sql').read_text();sql(migration);after=menus()
  for i,data in baseline.items():assert {k:after[i].get(k) for k in data}==data,('page or permission changed',i)
  assert all(after[i]==m for i,m in pay.items());assert after[12]['parentId']==1
  checks.append('原页面ID、组件、权限、状态及系统审计和支付分组保留')
  def children(parent):return [m for m in after.values() if m['parentId']==parent and m['type'] in [1,2]]
  def names(parent):return {m['name'] for m in children(parent)}
  assert names(2)=={'基础配置','认证中心','文件管理'}
  assert names(920000)=={'API 日志','监控中心','消息中心','应用版本','WebSocket 调试'}
  assert names(920001)=={'配置管理','字典管理','地区管理'}
  assert names(920002)=={'OAuth 2.0','三方登录'}
  for parent in [201,529,772,98,318,332,193,88,773,12]:
   old={i for i,m in before.items() if m['parentId']==parent};new={i for i,m in after.items() if m['parentId']==parent};assert old==new,('existing group split',parent)
  checks.append('公共服务及运维中心按确认方案聚合，原二级分组完整保留')
  granted={int(i) for i in query(f'SELECT menu_id FROM system_role_menu WHERE role_id={fixture} AND deleted=0').splitlines()}
  assert granted=={1,201,202,2,920002};package=set(json.loads(query(f'SELECT menu_ids FROM system_tenant_package WHERE id={fixture}')));assert package==granted
  checks.append('既有角色和套餐仅补导航父节点，不获得其他功能权限')
  count=query(f'SELECT COUNT(*) FROM system_role_menu WHERE role_id={fixture}');sql(migration);assert menus()==after;assert query(f'SELECT COUNT(*) FROM system_role_menu WHERE role_id={fixture}')==count
  checks.append('重复迁移不会重复授权或改动既有菜单')
  (LOCAL/'menu-layout-result.json').write_text(json.dumps({'passed':checks},ensure_ascii=False,indent=2));print('菜单分组与权限保留验收通过：4 项')
 finally:
  sql(f"DELETE FROM system_role_menu WHERE role_id={fixture}; DELETE FROM system_role WHERE id={fixture} AND code='menulayout{suffix}'; DELETE FROM system_tenant_package WHERE id={fixture} AND name='menulayout{suffix}';")
if __name__=='__main__':main()
