# 局域网应用更新交接（切换账号后继续）

记录时间：2026-10-15 约 00:48，北京时间。

## 用户最新指示，优先于此前静态站点方案

1. 暂时复用本项目现有后台，提供轻量的版本检查接口和下载本地 APK 的接口；手机与 PC 同局域网验收。
2. 暂不建设独立管理员后端、版本数据库和管理页面，后续再将这两个接口及版本管理迁出。不能继续以没有独立 HTTPS 域名为理由阻塞当前局域网方案。
3. 更新是基础能力，与通话、配对、客户、业务登录无关，不能用通话状态推迟安装或拦截外呼。
4. UI 要求已经实现：我的页面灰色版本号，右侧「检查更新 / 更新」；无更新提示「已经是最新版本」；自动弹窗包含版本更新内容，提供「更新 / 跳过」。
5. **完整验证成功之后，给用户可安装、带实际更新配置的 APK，并提交版本相关代码。** 提交必须 `类型(范围): 中文说明` 且同提交补充 CHANGELOG。
6. 用户因短期额度将切换账号，要求交接后在下一周期继续；**明确说不用安排自动任务**。本次没有创建自动任务，不要再建。

## 当前真实进度

- 1.0.7（105）修补包已交给用户，用户已确认应用广场能打开。文件：`apps/call-phone-uni/dist/release/apk/tongzige-1.0.7-20261014-fix.apk`，同原正式签名。
- 源码当前为 1.0.8（106），**没有生成或交付 1.0.8 APK**，没有接通应用内更新服务器。
- 客户端更新交互、解耦、跳过偏好及发布工具已实现。上一轮验证：143 项移动端测试、9 项发布/提交检查测试、类型检查、App/H5 构建通过；真实 1.0.7 对比 1.0.6 的离线发布演练通过。
- 浏览器实测我的页面版本灰字/右侧按钮，390px、320px 无溢出。截图：`/Users/shangjunhao/.codex/visualizations/2026/10/14/01a13b02-6346-78d1-8f95-fc5a83003ef0/app-update-preview.png`。本次 UI 预览服务器已停止。
- **这一轮只调查了局域网接入，没有新增 Java 更新接口，没有改 Compose 部署，没有开启 LAN 监听，也未完成 LAN 下载验证。**
- 当前客户端与发布工具仍强制 HTTPS，需要实现只对明确配置的私网 origin 开放 HTTP 的局域网适配，同时保留发布签名、APK 摘要/包名/版本/证书校验。

## 已查明的本机与后端情况

- 仓库 `/Users/shangjunhao/Project/ai-market`，分支 `codex/feature/mobile-pc-integration`。
- 最新局域网接口是 **en1，IPv4 192.168.31.113**，当时 active。en0 无地址，不能假定 Wi-Fi 必定 en0。继续时重查 IP，DHCP 可能变化。
- Tailscale IP 当时 `100.87.254.68`。
- Docker 现有 `yudao-local-server-1` 在运行，仅监听 `127.0.0.1:48080` 与 `100.87.254.68:48080`，**未监听 192.168.31.113**。其他 AI/Agent 容器也在运行；数据库/Redis 数据必须保留，不执行 down -v。
- `apps/ruoyi-vue-pro/compose.local.yml` 用 `${CALLPHONE_API_BIND_HOST:-127.0.0.1}:48080:48080` 暴露 API；`compose.tailscale.yml` 追加 Tailscale 端口。可在已有配置基础上增补当前 LAN 监听，不要丢掉原有回环/Tailscale 入口。
- 后端容器在检查时刚被另一个任务重启，工作区有大量并行 AI/Agent 改动。修改/重建前重新核对状态，保留它们，不能一起误提交。
- Java 系统 `java` 没有默认 JRE；`mvn` 默认使用 JDK 27。已确认 JDK 21 存在：`/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`。后端 Dockerfile 也是 Maven + JDK21。
- Docker socket 需要沙箱外权限；本会话 `docker` 已成功获准执行。不要打印 Docker env（有服务密钥）。

## 下一步实现建议（还未写代码）

### 1. 后端两个公共接口

在现有 callphone Maven 模块中，以独立 update 包承载，类只依赖文件/HTTP框架，不 import 客户、通话、设备或业务账号服务。方便后续迁出。

建议与现有发布工具的目录布局直接兼容：

- `GET /api/v1/app-updates/{packageName}/android/{architecture}/{channel}/manifest.json`
- `GET /api/v1/app-updates/{packageName}/apk/{versionCode}-{sha256}.apk`

接口读取配置的独立发布目录，例如环境 `APP_UPDATE_STORAGE_ROOT`。挂载 `.local/app-update/<实际发布目录>/public`，不能映射仓库/私钥/录音目录。检查接口原样返回签名 JSON，不包业务 CommonResult；下载支持 GET/HEAD、Content-Length、正确 MIME、可选 Range。

控制器使用 `@PermitAll` 和 `@TenantIgnore`，无需登录和 tenant-id。框架自动收集 TenantIgnore URL，路径在 controller.update 包，不会套 app-api/admin-api 前缀。确认框架安全对类/方法 PermitAll 的扫描方式，必要时方法逐一加注解。

已看过：

- `yudao-framework/.../GlobalResponseBodyHandler.java` 只处理返回 CommonResult 的方法，不会主动包装 Resource/ResponseEntity。
- `yudao-framework/.../YudaoTenantAutoConfiguration.java` 收集控制器 TenantIgnore 路由。
- `MobileDeviceSessionGuard` 限制移动设备令牌只能访问 mobile 路径，所以更新请求应继续不携带业务令牌。

严格限制路径参数格式，并用 normalize/realPath 检查目录边界及符号链接，避免读出私钥等任意本地文件。文件不存在返回 404，版本未发布不可误报已最新。增加真实 Spring MVC 测试：匿名访问、原始 envelope、APK 全量/Range、缺失文件、路径穿越/符号链接。

### 2. 客户端与发布工具 LAN 适配

相关文件：

- `src/modules/app-update/source.ts` 的 httpsOrigin 与 createSignedReleaseSource：现在只许 HTTPS。
- `src/modules/app-update/core.ts` validateRelease 第约99行：现在 artifact URL 强制 HTTPS。
- `src/services/updates.ts`：从 VITE_UPDATE_* 组装，不依赖业务。
- `tools/app-update/release.mjs` prepareRelease 第约56行：只许 HTTPS。

可增加显式 `VITE_UPDATE_LAN_ORIGINS` 和发布命令 LAN 开关，只允许准确配置的私网 IPv4 origin（RFC1918/需要时 Tailscale），默认 HTTPS 策略不放宽；不要用「任意 HTTP」开关。清单和 APK 双方均应用相同策略，仍验证签名。URL 拒绝账号、片段、伪造 IP 和非授权域。Android 原包 already `usesCleartextTraffic=true`，无需为此新增原生模块，但重打包后需核验。

真实入口可为 `http://192.168.31.113:48080/api/v1/app-updates`（重查IP后再用）。初始安装包编译进对应源地址和公钥；业务配对不应成为检查更新前置条件。

### 3. 构建、发布、验收、提交

- 补 CHANGELOG：开发改动目前仍在「未发布」。正式 1.0.8 发布时归档为 `[1.0.8] - 2026-10-15`，发布工具严格读取与 APK 版本相同的章节。
- 先配置真实 LAN 发布地址、公钥，生成 1.0.8 APK。沿用1.0.7的包名、证书、原生插件。
- 本机签名配置 `apps/call-phone-uni/.android-signing.local.json` 可用，**不要输出内容**。
- 如果原生 dex/so/插件没有变化，可沿用此前本地重组流程。`/tmp/tongzige-apk-inspect` 是先前1.0.7解包目录（勿误认为最新版），存在仅作参考。HBuilderX 内置 apktool/apksigner/zipalign/JRE 在 `/Applications/HBuilderX.app/Contents/HBuilderX/plugins/app-safe-pack` 与 `plugins/amazon-corretto`。
- 正式打包脚本 `scripts/pack-android-release.cjs` 走 HBuilderX 安心云打包，涉及原生材料上传，之前已说明范围，不要盲目重新提交云队列。
- 当前更新密钥已存在 `.local/app-update/release-private.pem`，权限600，**不能重新生成覆盖**。发布演练在 `.local/app-update/rehearsal`，其 example.test 只是占位，不可当实际发布。
- `tools/app-update/cli.mjs prepare` 验证真实 APK、基准证书、版本、CHANGELOG，输出 public/ 和 client.env。建议补独立配置生成步骤，避免「先需 APK 才能取得构建配置」循环；公钥可直接从现有私钥导出，不能将私钥写入移动端。
- 后端构建部署、LAN 端口开放后，实际从 LAN 地址获取签名 JSON 和完整 APK，核对下载摘要、大小、包名、版本和签名。验证旧版本身份→有更新，新版本身份→最新版，检查路径不需要业务登录。
- 没有连接 Android 手机。若仍无手机，明确区分「实际网络下载和包校验通过」与「手机系统安装验收」，不能冒充真机闭环已通过。用户会拿新包验证，给清晰手机同网使用条件。
- 用户明确授权验证成功后 **提交版本相关代码**，不等于允许混入 AI/Agent 等其他任务修改；尚未授权 push，不默认推送。

## 当前本任务改动与提交边界

此前同聊天的1.0.7导航/图标修复也仍未提交；本轮更新相关源文件同样未提交。当前工作区没有为本任务新建分支/暂存。

本任务源码：

- `apps/call-phone-uni/src/components/AppUpdateRow.vue`（新增）
- `src/modules/app-update/presenter.ts`（新增），`core.ts`，`services/updates.ts`
- `src/pages/mine/index.vue`（仅更新入口区域/导入）
- `src/services/calls.ts`（仅删除更新的callStartGuard，6行）
- `src/env.d.ts`（版本常量），`vite.config.ts`（从manifest注入版本），`src/manifest.json`（当前106）
- `tests/update-presenter.test.cjs`（新增），`tests/integration.test.cjs`（只更新两处更新用例和辅助函数）
- `tools/app-update/{cli,release,test}.mjs`、README
- `scripts/sign-app-release.mjs`（复用导出），check-changelog/install-git-hooks及测试，`.githooks/pre-commit`
- 根AGENTS.md、CHANGELOG.md、相关docs/README、`.gitignore`中仅本任务新增 `/.local/app-update/`

1.0.7同聊天修补：TabBar.vue、root-navigation.ts与测试、pages/index/index.vue、AndroidManifest.xml、nativeResources图标、branding/build-icons.cjs及图标README/修补记录。

**不要提交**其他任务的 AgentTaskPanel、ai-chat页面/services/types、chat-markdown、Android文件读取、AI/Agent服务及后端Agent/AI控制器等变化。README、manifest、.gitignore等共享文件需查看具体hunk，避免误带。

当前版本相关追踪文件补丁快照与完整 status 在 `.local/app-update/handoff-20261015/`；快照只是当前状态备份，**不要盲目覆盖/反向应用**，继续时先重查实际工作区。

根 AGENTS.md 当前写「不依赖业务服务器」，已被用户最新复用后端指示覆盖：继续时应改成「实现不依赖业务逻辑/登录，短期复用后台独立公共更新路由」。旧 docs 中「暂不接业务后端」同样需要更新。

## 已验证命令（上一轮）

```sh
pnpm --dir apps/call-phone-uni type-check
pnpm --dir apps/call-phone-uni test
pnpm --dir apps/call-phone-uni build:app
pnpm --dir apps/call-phone-uni build:h5
node --test tools/app-update/test.mjs scripts/check-changelog.test.mjs
```

本机 Git hook 已启用 `.githooks`，新提交必须同时暂存 CHANGELOG 的新增实际条目；不要使用 --no-verify。
