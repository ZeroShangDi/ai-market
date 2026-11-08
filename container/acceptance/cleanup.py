"""Remove only this suite's synthetic records from its dedicated acceptance database."""
from api_check import sql,request,login,env
from environment import LOCAL
import json

def main():
 token=login(env['CONTAINER_ADMIN_USER'])['accessToken']
 # Menu deletion through the service invalidates the original permission/menu caches.
 result=request('/admin-api/system/menu/delete?id=100000','DELETE',token=token)
 assert result['code'] in [0,1002003000],result['code']
 sql("""START TRANSACTION;
 DELETE FROM system_user_role WHERE user_id IN (SELECT id FROM system_users WHERE username REGEXP '^check[0-9a-f]{8}$' OR (id=2 AND username='viewer')) OR role_id IN (SELECT id FROM system_role WHERE code REGEXP '^check[0-9a-f]{8}$');
 DELETE FROM system_role_menu WHERE role_id IN (SELECT id FROM system_role WHERE code REGEXP '^check[0-9a-f]{8}$');
 DELETE FROM system_oauth2_access_token WHERE user_id IN (SELECT id FROM system_users WHERE username REGEXP '^check[0-9a-f]{8}$' OR (id=2 AND username='viewer'));
 DELETE FROM system_oauth2_refresh_token WHERE user_id IN (SELECT id FROM system_users WHERE username REGEXP '^check[0-9a-f]{8}$' OR (id=2 AND username='viewer'));
 DELETE FROM system_users WHERE username REGEXP '^check[0-9a-f]{8}$' OR (id=2 AND username='viewer');
 DELETE FROM system_role WHERE code REGEXP '^check[0-9a-f]{8}$';
 DELETE FROM infra_config WHERE config_key REGEXP '^acceptance\\.[0-9a-f]{8}$' OR (id IN (100001,100002) AND config_key IN ('container.acceptance','container.private'));
 DELETE FROM system_notify_message WHERE id IN (100001,100002) AND template_code='acceptance';
 DELETE FROM system_sms_log WHERE template_code REGEXP '^extension-sms-[0-9a-f]{8}$';
 DELETE FROM system_mail_log WHERE template_code REGEXP '^extension-mail-[0-9a-f]{8}$';
 DELETE FROM system_oauth2_access_token WHERE client_id REGEXP '^(extension|browser|gateway|gateway-other)-[0-9a-f]{8}$';
 DELETE FROM system_oauth2_refresh_token WHERE client_id REGEXP '^(extension|browser|gateway|gateway-other)-[0-9a-f]{8}$';
 DELETE FROM system_oauth2_code WHERE client_id REGEXP '^(extension|browser|gateway|gateway-other)-[0-9a-f]{8}$';
 DELETE FROM system_oauth2_approve WHERE client_id REGEXP '^(extension|browser|gateway|gateway-other)-[0-9a-f]{8}$';
 COMMIT;""")
 if (LOCAL/'features.json').exists() and json.loads((LOCAL/'features.json').read_text()).get('payments'):
  sql("DELETE FROM pay_channel WHERE app_id IN (SELECT id FROM pay_app WHERE app_key REGEXP '^(acceptance-pay-[0-9a-f]{8}[01]|pay-ui-[0-9a-f]{8})$'); DELETE FROM pay_app WHERE app_key REGEXP '^(acceptance-pay-[0-9a-f]{8}[01]|pay-ui-[0-9a-f]{8})$';")
 print('已清理本套验收的合成账号、角色、配置、通知与示例入口')
if __name__=='__main__':main()
