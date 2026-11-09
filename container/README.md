# Container

从现有工程抽离的公共底座，按「通用公共能力」与「端内公共能力」维护。PC 直接沿用原芋道 Vue3 管理平台，保留完整布局、表格、表单、权限树、导航、标签页、个人中心与主题语言；移动端复用原 uni-app 页头、底部导航、应用网格、账户、更新及诊断界面。不是重新手写的简化演示页。

| 目录 | 负责内容 |
|---|---|
| backend | 芋道 framework/system/infra 独立后端：应用版本管理、登录、组织权限、配置、文件、站内通知、短信邮件、社交认证、地区、监控和日志 |
| pc | 用户角色、组织字典、配置文件通知日志，以及短信、邮件、社交应用、OAuth2、地区、监控和通信的原版管理页面 |
| mobile | 工作台、应用入口、账户连接、配置读取、文件上传下载、通知、诊断及原生更新能力 |
| shared | 通用客户端、会话生命周期、菜单入口校验、诊断与原生上传编码 |
| acceptance | 独立 MySQL/Redis、启动器、合成测试数据和真实操作验收 |

## 本机启动

仓库根目录运行 `python3 container/acceptance/start.py`。支付模块可加 `--with-payments`，仍保持真实资金处理关闭。已有同配置构建可加 `--no-build`；重复启动不会重复创建进程。需要 Docker Desktop、Java 21、Maven、Node.js 22.18+、pnpm、npm 和 Python 3。两端均使用各自 pnpm 锁文件独立安装，不依赖旧项目 node_modules。

- [PC 管理平台](http://127.0.0.1:5188/)
- [移动 H5](http://127.0.0.1:5190/)
- 账号见 `.local/login.txt`，或运行 `python3 container/acceptance/credentials.py`。
- 后端 48090，专用 MySQL 23316、Redis 23379；仅绑定本机，不连接原产品数据库。
- 停止：`python3 container/acceptance/start.py --stop`，数据保留。

本机随机凭据、运行包、截图与测试日志保存在忽略提交的 `.local`。首次初始化仅支持新数据库，不覆盖已有账号。手工部署步骤见 [后端说明](backend/README.md)。

## 简单模块接入

在 PC 原版「菜单管理」新增外链菜单，使用独立 HTTP(S) 来源，分配到对应角色。生产应用使用独立主机名，不只换端口隔离 Cookie。需要嵌入时按芋道约定在 URL 加 `?_iframe=1`（已有查询参数则用 `&_iframe=1`）。移动应用网格从同一个服务端授权菜单生成入口，不再另外维护一套模块清单。关闭菜单或收回角色权限即可移除入口，不删除业务数据，不引入安装器或复杂版本机制。

PC 使用 iframe、移动使用 WebView。模块后端独立提供业务接口，服务端自行鉴权；公共页面仍归底座。不会把底座令牌拼接进模块地址。已恢复原 OAuth2 客户端/令牌管理及 /sso 授权页，并实测授权码换码；各业务仍需实现自己的回调与会话。原模块编译接入与独立应用接入的具体边界见 [模块接入说明](docs/module-boundaries.md)。

## 验收

先执行 `python3 container/acceptance/api_check.py`，再使用 `acceptance/requirements.txt` 对应的 Playwright 环境运行 `container/acceptance/browser_check.py`。完成后可运行 `python3 container/acceptance/cleanup.py` 清理本套合成数据。生产验证码检查另见 `captcha_check.py`（需先启动 PC 生产预览 5189），空库检查见 `bootstrap_check.py`。前者准备合成配置、通知、无权限账号和独立外链；后者真实操作原版用户/角色/权限/配置/文件/通知页面、移动界面及主题语言，不模拟成功响应。测试模块进程在 5200，仅供验证隔离接入。

详见 [当前验证记录](docs/validation.md)。正式接入前应使用独立环境配置，移除验收数据。生产 PC 构建使用 `pnpm --dir container/pc build`，默认启用原滑块验证码；开发验收模式才关闭验证码。移动构建使用 `pnpm --dir container/mobile build:h5` 或 `build:app`。

公共依赖边界可用 `python3 container/acceptance/boundary_check.py` 持续检查，避免后续业务反向侵入公共层。正式部署需代理 `/admin-api`、`/infra/ws`（含连接升级）、`/admin` 和 `/druid`，监控代理保留浏览器 Host 与 Cookie；不能仅部署静态页面。

扩展验收：`extended_api_check.py`、`extended_browser_check.py`、`websocket_check.py`。监控使用独立账号，凭据同样记录在 `.local/login.txt`；SkyWalking 未配置时保留明确状态，不访问原公共演示地址。短信平台、微信/钉钉等真实外部账号需要自行配置，测试不发送外部短信或邮件。

## 当前边界

文件沿用芋道持 URL 可下载的机制，不能直接当作敏感业务附件的授权存储。通知指站内信，不包含系统推送。移动原生资源已编译；本次未生成 APK、未真机验证 Android 文件选择、保存及升级安装。更新不依赖业务登录，未配置正式签名发布源时不会虚构新版。本机 HTTPS/mTLS、应用 scope 与限流负例已验证；正式域名证书、备份、外部系统集成与真机验证仍应在各自实际环境完成，不能将本地验收称作商用上线完成。

不依赖原有 AI/Agent/语音项目，控制与语音插件属于后续独立接入。来源记录在 sources.json；保留原许可证，容器独立维护，不自动同步原工程。

## 本轮补充能力

- [公共 API 安全](docs/api-security.md)：TLS/mTLS、证书与真实 clientId 绑定、最小 scope、权限及 Redis 限流；公开客户端不能保密静态密钥。
- [可选支付](docs/payment-scope.md)：各应用独立商户配置，原支付/退款/通知记录页面；真实交易没有启用。
- [应用版本](docs/app-release.md)：登记、不可变安装包、离线验包签名、草稿发布、同版本续期和签名撤回；不依赖业务登录。

验收脚本增加 `gateway_check.py`、`rate_limit_check.py`、`payment_check.py`、`payment_browser_check.py`、`release_check.py`、`release_browser_check.py`、`monitor_session_check.py`。`release_signing_check.mjs` 只读检查传入的已有 APK，使用临时测试密钥签清单，不打包或发布应用。

使用生产 Nginx 模板时启用 `container,edge`（带支付则 `container,payments,edge`），Nginx 与后端通过可信回环连接；其他部署拓扑需显式配置可信代理。监控页面保留 Cookie，业务 Token API 不转发或回写 Cookie，不能丢掉该隔离配置。浏览器直接跨域来源通过 `CONTAINER_BROWSER_ORIGINS` 精确登记，生产同源默认不需增加来源。

当前 PC 导航为「系统管理、公共服务、运维中心、支付管理」。菜单结构调整通过 `backend/sql/menu-layout.sql` 应用；新环境启动自动导入，已有环境手工升级时执行该文件。旧页面地址保留跳转，审计日志与支付分组不动。

应用版本支持历史归档：从旧本地发布目录逐包验签、迁入历史及安装包，不自动发布。操作与证据分级见 [版本管理说明](docs/app-release.md)。正式包、私钥与本机归档数据均不提交 Git。
