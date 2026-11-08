package cn.iocoder.yudao.server;

import cn.iocoder.yudao.framework.common.util.json.JsonUtils;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;
import java.util.UUID;

/** Explicit first-run bootstrap for a NEW database only. Never resets existing users. */
@Component
@Profile("bootstrap")
public class ContainerBootstrap implements ApplicationRunner {
    private final JdbcTemplate db;
    private final PasswordEncoder encoder;
    public ContainerBootstrap(JdbcTemplate db, PasswordEncoder encoder) { this.db = db; this.encoder = encoder; }
    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        String username = System.getenv("CONTAINER_ADMIN_USER");
        String password = System.getenv("CONTAINER_ADMIN_PASSWORD");
        String domain = System.getenv("CONTAINER_FILE_URL");
        if (username == null || !username.matches("[A-Za-z0-9]{4,30}") || password == null || password.length() != 16)
            throw new IllegalStateException("首次初始化需要管理员账号和16位密码环境变量");
        try {
            var uri = java.net.URI.create(domain);
            if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null)
                throw new IllegalArgumentException();
        } catch (RuntimeException error) { throw new IllegalStateException("首次初始化需要有效的公共文件访问地址 CONTAINER_FILE_URL"); }
        for (String table : new String[]{"system_users", "system_tenant", "system_dept", "system_role", "system_user_role", "system_oauth2_client", "infra_file_config"})
            if (db.queryForObject("SELECT COUNT(*) FROM " + table, Long.class) != 0)
                throw new IllegalStateException("初始化仅支持空数据库，拒绝覆盖已有公共数据");
        db.update("INSERT INTO system_tenant (id,name,contact_user_id,contact_name,package_id,expire_time,account_count,websites) VALUES (1,'容器',1,'管理员',0,'2099-12-31',100,'[]')");
        db.update("INSERT INTO system_dept (id,name,parent_id,sort,status,tenant_id) VALUES (1,'默认部门',0,0,0,1)");
        db.update("INSERT INTO system_users (id,username,password,nickname,dept_id,tenant_id,post_ids) VALUES (1,?,?, '管理员',1,1,'[]')", username, encoder.encode(password));
        db.update("INSERT INTO system_role (id,name,code,sort,data_scope,data_scope_dept_ids,status,type,tenant_id) VALUES (1,'管理员','super_admin',0,1,'[]',0,1,1)");
        db.update("INSERT INTO system_user_role (user_id,role_id,tenant_id) VALUES (1,1,1)");
        db.update("INSERT INTO system_oauth2_client (client_id,secret,name,logo,status,access_token_validity_seconds,refresh_token_validity_seconds,redirect_uris,authorized_grant_types,scopes,auto_approve_scopes) VALUES ('default',?,'容器','',0,1800,604800,'[]','[\"password\",\"refresh_token\"]','[]','[]')", UUID.randomUUID().toString());
        String config = JsonUtils.toJsonString(Map.of("@class", "cn.iocoder.yudao.module.infra.framework.file.core.client.db.DBFileClientConfig", "domain", domain));
        db.update("INSERT INTO infra_file_config (name,storage,master,config) VALUES ('公共文件',1,1,?)", config);
    }
}
