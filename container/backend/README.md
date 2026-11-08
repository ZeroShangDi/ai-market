# 公共后端

复用芋道 framework、system、infra；独立 Maven reactor，不引入 callphone、AI、Agent 或语音服务。根 LICENSE 保留上游 MIT 许可。Java 17+、MySQL 8、Redis；项目依赖和精确版本继续由原 Maven BOM 管理。

## 首次准备

1. 创建独立空数据库（utf8mb4），依次导入 sql/schema.sql、sql/common-data.sql 与 sql/menu-layout.sql：前者包含 system/infra 及独立更新发布表的建表语句，后者仅包含已保留公共页面的原菜单和字典元数据，没有旧账号、令牌或业务数据。
2. 通过本机环境管理器提供 CONTAINER_DATABASE_URL、CONTAINER_DATABASE_USER、CONTAINER_DATABASE_PASSWORD，以及独立运维账号 CONTAINER_MONITOR_USER、至少16位强密码 CONTAINER_MONITOR_PASSWORD；可选 CONTAINER_REDIS_HOST、CONTAINER_REDIS_PORT、CONTAINER_REDIS_DATABASE（默认 2）、SPRING_DATA_REDIS_PASSWORD。数据库 URL 示例：jdbc:mysql://127.0.0.1:3306/container?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai。
3. 执行 mvn -DskipTests package，得到 server/target/yudao-server.jar。
4. 首次显式初始化：额外提供 CONTAINER_ADMIN_USER（4～30 位字母数字）、CONTAINER_ADMIN_PASSWORD（16 位，与现有登录校验一致）、CONTAINER_FILE_URL（文件访问的 HTTP(S) 根地址，如 http://127.0.0.1:48090）；执行 java -jar server/target/yudao-server.jar --spring.profiles.active=container,bootstrap。
5. 初始化后停止，移除管理员初始化环境变量，再以 java -jar server/target/yudao-server.jar 正常启动。bootstrap 在数据库已有公共数据时会拒绝，不重置密码，不覆写账号。

初始化在一个事务中创建租户 1、默认部门、管理员及 super_admin 角色、默认令牌客户端、数据库文件存储。仅在新库初始化时使用；没有自动建库、自动升级或删除数据流程。文件默认保存在数据库，下载遵循芋道原文件访问方式（持 URL 可读），不作为敏感业务附件的权限存储承诺。

默认只监听 127.0.0.1:48090。正常 container 配置默认启用原图形验证码，PC 生产构建保留原滑块验证界面。本机隔离验收环境才设置 CONTAINER_CAPTCHA_ENABLED=false。未开启 mock；对外部署应配置 HTTPS、明确来源策略及实际运维环境。

接口路径沿用 /admin-api/system/auth、system/permission、infra/config、infra/file、system/notify-message、system/login-log、system/operate-log、infra/api-access-log、infra/api-error-log。业务服务不直接查询这些表。

/api/v1/app-updates 和 /api/v1/pet-resources 是从旧业务模块中抽出的独立公开资源路由，存储根通过 CONTAINER_RELEASE_ROOT 指定。发布私钥、APK 和本地材料不放 Git。本次没有发布新版或修改原生产地址。

隔离验收环境已完成真实数据库初始化与两端联调，见上级说明和 docs/validation.md；没有修改原生产服务。

监控与通信：Spring Boot Admin 使用 /admin，数据库监控使用 /druid，二者与已开放的 Actuator 由独立运维认证保护，不复用业务账号。WebSocket /infra/ws 只接受 CONTAINER_PC_URL 及本机后端的明确来源；正式部署应设置正确的 PC HTTPS 地址并代理 WebSocket 升级。当前为单实例 local 发送器。短信、邮件、三方认证的管理接口沿用原方法权限和配置实体语义，详见 ../docs/module-boundaries.md。

新增应用版本管理需在已有独立基座数据库导入 `sql/app-release.sql`；新库 schema 已包含。升级前应备份，不通过 bootstrap 重置已有环境。公开更新传输读取已发布的签名清单，操作步骤见 [应用版本说明](../docs/app-release.md)。

可选支付构建使用 `-Ppayments`，另导入 `sql/payments.sql` 并启用 `container,payments` 配置；默认不装配。各应用独立渠道商户，资金处理默认关闭，见 [支付边界](../docs/payment-scope.md)。生产 HTTPS/mTLS 和外部应用最小权限见 [API 安全](../docs/api-security.md)。

导航分组升级：已有基座执行 `sql/menu-layout.sql`，按公共服务与运维中心重组原菜单；原页面 ID、组件、权限及完整分组不变，仅为原有授权补充导航父节点。迁移可重复执行，不增加其他功能授权。前端同步构建后兼容旧页面地址。
