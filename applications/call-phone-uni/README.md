# 手机助手第一版

从 `apps/call-phone-uni` 复制后独立改造，原工程未改。复用原生桌宠、语音浮窗、角色资源、诊断和更新实现；公共客户端及更新校验复用 container 的既有实现，副本在本应用内，不依赖旧 AI、Agent、语音服务。

- 控制台：真实 container 站内通知，包含未读、分页、标记已读；不是系统离线推送。
- 应用：聊天、工作、语音三个 WebView，独立页面源码在 `features/`，无能力中心。
- 聊天：始终绑定 Voice Center 配置的固定 Control 会话，不提供新建会话。新手机文字与宿主观察到的语音转写在 `host` 私有目录持续记录，重启保留；不把这个镜像当作插件授权依据。插件已有历史未通过公开接口完整导出，不宣称自动迁入全部旧语音历史。
- 工作：通过 Control 的公开 WebSocket 工具读取归属当前固定助手的任务创建事件，保存归属索引并展示工作状态、结果摘要和记录，可续发消息、停止；无关联任务显示空列表。问题/审批由聊天中的真实用户发言交给现有插件处理，不在手机伪造授权。
- 语音：Voice Center 公开票据/SDP 接口与从插件复用的实时音频浏览器模块，任务通知经 SSE 进入播报队列；只有实际播放结束回执才更新播报状态。
- 我的：登录状态、权限设置、诊断日志、检查更新；原相机、电话/通话记录、文件访问、麦克风、悬浮窗、通知、后台运行、安装及无障碍入口集中在权限设置。手机宠、宠物语音及角色资源移至应用→语音→手机宠。无障碍当前提供系统设置入口及本应用服务状态查询；原包没有无障碍 Service，显示“当前包未集成无障碍服务”，不把手机整体无障碍开启当成本应用授权。未新增屏幕读取或自动操作能力。

## 本机运行

Node 22.18+（WebSocket）、pnpm，先安装本应用依赖：`pnpm --dir applications/call-phone-uni install --frozen-lockfile`。当前机器仅复用已有依赖缓存建立忽略提交的 node_modules 链接，不要求该路径在其他机器存在。

1. 启动 container 48090、Bridge Control 8792、Voice Center 8891；不启动旧 AI/Agent/语音后端。
2. 将 `host/config.example.json` 复制到 `.local/host.json`，权限 600。绑定键为经过 container 核验的 `租户ID:用户ID`；固定会话 ID 来自已初始化 Voice Center workspace。插件凭据只在服务端读取。
3. `POST Voice Center /api/open` 仅在现有固定会话初始化完成后取得本地音频会话 ID，写入 localVoiceSessionId。两个 ID 不可混用；语音插件重启后需重新取得本地 ID。host 不擅自创建新的远程助手会话。
4. `pnpm --dir applications/call-phone-uni host`，然后 `pnpm --dir applications/call-phone-uni dev:h5`。预览 http://127.0.0.1:5192/；5193 是仅监听回环的宿主服务。
5. App 只配置统一 HTTPS 入口 `VITE_CONTAINER_API_URL`；入口将 `/admin-api/` 转到容器，将 `/mobile-host/` 转到 5193，宿主 origins 精确登记该 HTTPS 来源。角色资源地址使用独立的原不可变资源分发目录，不是旧 AI 后端。H5 本机开发通过同源代理即可。

## 安全与原生边界

宿主是本应用内的薄适配层，不是第四套业务后端。它逐次调用 container 核验用户令牌，只允许读取绑定会话和归属任务。手机不携带 Control 共享令牌。WebView 使用 30 秒一次性入口票据，交换为仅保存在该页内存的短期会话；入口地址不含 container 令牌。刷新内页需从应用页重新打开。跨来源拒绝、注销失效、任务越权、未知写入不自动重试及持久化回归见 host 测试。

现有 Voice Center 的音频票据身份由服务端配置，是单宿主身份；本版只有 voiceOwnerKey 指定用户能使用该音频实例，不冒充多用户语音隔离。增加普通客户多用户语音需要先在插件端验证、再扩展，不修改其他端权限。工作列表只接受当前助手创建事件和运营者明确登记的任务，不按任意客户端 ID 查询。

桌宠沿用安装包内 portable-pet-overlay 与 portable-voice；恢复已安装角色，长按菜单开启/关闭宠物语音。未安装角色可从宿主独立资源目录加载。使用 `node host/import-pet-resources.mjs /旧公开资源目录 /新独立目录` 迁入目录；工具验证清单和每个文件的大小/哈希，只复制目录中当前登记版本，不依赖旧后端。当前已迁入精灵3与鲸鱼娘3。角色动作由手机包控制，音色和人物设定依照新 Voice Center 配置；现有音频接口未提供按手机角色动态切换音色的参数，不冒充已同步旧音色。保留原素材来源与许可证，鲸鱼娘素材原有禁止商用限制仍有效。H5 不支持系统悬浮窗；后台持续语音和服务存活以真机为准。

更新组件要求 v2 签名清单，公开构建配置使用 VITE_UPDATE_*。1.0.26 沿用原分发地址及签名密钥，该地址已升级为同时兼容旧客户端的 v2 清单；AppID 和包名不变。容器保存历史档案，尚未切换为容器托管的公开更新源。

## 验证

`pnpm type-check`、`pnpm test`、`pnpm test:host`、`pnpm build:h5`、`pnpm build:app`（在本目录运行）。build:app 只编译资源，不代表原生 UTS/Kotlin 已打包或真机验收。没有用 mock 结果宣称真实模型、麦克风、桌宠或安装更新通过。

标准依据：Android [无障碍服务](https://developer.android.com/guide/topics/ui/accessibility/service)、[系统设置入口](https://developer.android.com/reference/android/provider/Settings#ACTION_ACCESSIBILITY_SETTINGS)，MDN [麦克风安全上下文与 iframe 授权](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)。当前运行实例不提供 realtime-qwen.js，已将插件协议音频渲染模块复制到本应用，不要求升级或重启插件。Voice Center 源码静态页自身禁止 iframe，本版用其公开协议和实时音频模块实现独立页面，未取消插件安全头。

## 登录与访客浏览

统一入口 `/pages/login/index`，与 PC 相同的租户名称、账号、密码及验证码接口，默认租户“容器”。记住账号仅保存账号与租户名称，不保存密码。生产构建默认启用滑块验证码，可通过 VITE_APP_CAPTCHA_ENABLE 显式匹配部署策略。登录可返回原应用，返回地址仅允许内部已登记页面。

控制台、应用列表、我的、全部权限设置、诊断和更新均可未登录访问；通知未登录显示空列表。仅访问个人聊天/工作/语音数据时显示一次统一登录入口，未删除宿主或后端权限校验。WebView 会话仍只保存在内存，重载页面需要重新登录。应用入口图标来源和提示词见 src/static/application-icons/README.md。

## 功能模块与登录扩展

`features/chat`、`features/work`、`features/voice` 分别维护独立 WebView 页面，`features/shared` 放共用通信与样式。宿主维持 `/mobile-host/` 公开路径兼容，静态资源按白名单提供。

登录页仅负责账号表单和验证码，`src/services/auth/account.ts` 负责账号认证，`types.ts` 定义登录提供者接口。后续短信、一键及第三方登录应各自实现提供者与凭据类型，并在后端具备接口后接入，不添加空按钮。租户由 `VITE_LOGIN_TENANT_NAME` 指定，默认“容器”；公共服务与应用宿主统一使用 `VITE_CONTAINER_API_URL`，由部署配置，不在登录页编辑。历史 container.connection 仍兼容；旧 assistant.host-url 和 VITE_MOBILE_HOST_URL 不再参与连接选择。


## 最小统一入口与 Tailscale

保留本机 48090、5193、8792、8891。App 只访问统一 HTTPS 入口；5193 继续负责用户绑定与插件协议。1.0.26 已生成安装包，不迁移插件。

本机专网预览：先 `pnpm build:h5`，再 `pnpm preview:gateway`（5194，仅回环）。Vite preview 复用 server.proxy；默认容器 48090、宿主 5193。可通过环境变量 `CONTAINER_UPSTREAM`、`MOBILE_HOST_UPSTREAM` 指定其他后端，地址仅供服务端使用。preview 只用于专网验证，长期部署使用 `deploy/mobile.conf` 的 Nginx 模板。

确认现有 Tailscale Serve 配置后，在未使用的 HTTPS 端口执行 `tailscale serve --bg --https=8443 http://127.0.0.1:5194`。保留已有 443 入口，不运行 serve reset 或启用 Funnel。手机连接同一专网后访问 `https://<本机 MagicDNS 名>:8443/`。将该来源加入 `.local/host.json` 的 origins 并重启 5193。H5 默认同源；原生构建需将 `VITE_CONTAINER_API_URL` 设置为这个 HTTPS 来源，已安装的旧包不会自动获得新代码。

云端迁移：部署 Nginx 模板及 H5 资源，将公共接口指向实际容器，将 mobile-host 上游指向本机的受保护专网入口。可以保留 5193 回环监听，另用 Tailscale Serve 提供 HTTPS 到 5193；云端 Nginx 使用该 HTTPS 上游时开启 proxy_ssl_server_name 和 proxy_ssl_verify，配置系统可信 CA，并保留完整 /mobile-host/ 路径。通过 Tailscale ACL 限制入口访问。插件凭据仍只保存在本机；App URL 与接口路径无需改变。不要把 Vite preview 当作公网生产服务器。

接口请求走统一入口，WebRTC 音频仍走手机与本机 Voice 的网络通道。手机和电脑须保持 Tailscale 在线；需要实测 SDP 候选地址、双向音频、断线和重新开启。HTTP 或票据成功不代表音频成功。保留现有单语音用户限制与未知写入不重试策略。

统一入口联调：`MOBILE_VERIFY_BASE_URL=https://<入口> node host/verify-live.mjs`，使用本机既有验收凭据登录并登出，验证真实工作读取、音频票据及资源哈希，不发送聊天、不执行任务、不启用麦克风。


## Android 1.0.26（124）

新版安装包从本目录生成：`pnpm pack:android:safe`。该命令复用旧工程的官方 HBuilderX 安心打包脚本，通过显式 --project 指向本目录，使用账号云端证书；旧工程 manifest 不变。发布前执行 type-check、test、test:host、共享客户端测试与 build:app。部署指定的 VITE_CONTAINER_API_URL 优先于旧设备保存的地址，避免覆盖安装后继续访问旧端口；更新分发仍沿用独立签名源。

原生模块和权限与旧产品不同，不能只替换网页资源冒充新的原生包。必须检查最终 APK 的包名、versionName/versionCode、arm64 架构及与 1.0.25 相同的签名，并完成签名更新源下载验证。实际覆盖安装、麦克风与桌宠行为仍需手机确认。

## 统一聊天与结果交付（开发中）

聊天页同页复用语音连接；文字与语音转写写入同一持久记录。手机只补拉最终任务摘要与显式交付的文件，不展示工作执行流。进入、回到前台和每15秒检查结果；离页停止轮询。结果按工作会话去重，多页并发合并查询；同步慢或失败不禁止文字发送。

文件接口重新校验用户身份、工作归属与最终成果引用。`workArtifactRoots` 默认为空，管理员须在宿主配置中显式指定可交付目录，且文件须在宿主机器可读；不代理任意远程链接。符号链接解析后仍须处于共享目录。原生HTML5+优先下载到应用私有目录后打开，其他浏览器优先系统文件分享或下载；实际Android WebView接收与打开仍需真机验收。

应用列表另有拨号入口，复用原 leven-call 云插件与公共适配器，须生成包含该插件的原生包；H5不能拨号。尚未新增客户管理或自动拨号业务。

无障碍原生服务与本地 Operator 已落在 `src/uni_modules/portable-operator` 和 `src/modules/mobile-control`，调试与授权恢复见 [无障碍调试与授权恢复](docs/operator-debugging.md)。尚未接入桌面 WS 路由或固定软件函数，当前不能声称手机已能由桌面 Agent 远程控制。
