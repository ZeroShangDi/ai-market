# Call Phone 移动端

Vue 3 + TypeScript + uni-app 工程。页面依据 Figma 移动端画板 `2:2`、`2:20`、`2:71`、`2:112` 实现；接口以 `../../docs/modules/mobile-api-contract.md` 为基线。`62:24` 是 PC 页面，未用于本工程。

## 启动

```sh
pnpm install
cp .env.development.example .env.development
pnpm dev:h5
```

`VITE_MOBILE_MOCK=true` 仅在开发模式启用合成客户和派发数据；生产构建强制走真实接口。真实模式进入登录页，可设置服务地址、工作区 ID，并使用现有芋道员工账号登录（与 PC 相同）。登录与刷新复用 `/admin-api/system/auth/*`；启用滑块验证码的服务器通过现有 captcha/get、captcha/check 协议完成验证。access/refresh token 和设备密钥仅存当前进程内存，不写入环境文件或本地存储。退出登录清理会话；应用重启需要重新登录和配对。

已登录后在“我的 → 本机与配对”扫码或输入 PC“电脑与配对”页生成的六位配对码。二维码只包含一次性配对码、工作区和可选服务地址；不同工作区或服务地址会拒绝认领，需先以正确配置重新登录。APP 扫码使用 uni.scanCode，H5 请手工输入。客户页前台每 15 秒拉取派发并刷新心跳，后台/关闭页面不保证接收。可以接受并拨号或拒绝派发，通话后确认实际结果和同步录音。

手机不能通过自己的 localhost 访问电脑后端。请使用手机可达的服务域名或电脑局域网地址，并使 PC、手机的 tenant-id 一致。本地 Compose 默认只监听回环地址，可通过 `CALLPHONE_API_BIND_HOST=电脑局域网IP` 单独配置 API 监听地址；数据库与 Redis 仍只监听回环地址。完整的联调步骤见 [验收清单](../../docs/reviews/mobile-pc-acceptance.md)。公网服务使用 HTTPS。

所有页面采用自定义导航，关闭 App 原生空 titleNView；统一顶栏处理状态栏与安全区域，仍引用原 `static/figma/*.svg` 图标。改变 Barcode/native 模块后须重建自定义基座；仅热更新页面资源不能补齐原生扫码模块。

Android 代码可用 `pnpm build:app` 编译；真机需用 HBuilderX 安装含 `leven-call` 云端原生插件的自定义基座。`src/manifest.json` 延用早期 CallPhone 的插件 ID `16275` 和原 App ID，实际云打包资格与签名需在使用的 DCloud 账户下确认。H5 预览不拨真实电话。旧版插件的 `callPhone`、`registerListener`、`unRegisterListener`、`checkCallAutoRecorder`、`checkAllFilesPermission` 已封装在 `src/native/phone.ts`。插件状态仅作为候选信息，接通结果由用户确认。

“本机与配对”中的连通性测试只访问当前配置的客户侧 `/api/v1/mobile/bootstrap`：开发模拟模式会明确显示未检查真实服务，未配置地址会提示配置，401/403 表示服务可达但需要授权，404 表示移动端接口未实现。测试不记录地址或响应内容。“诊断与帮助”中的 10086 测试在用户确认后直接调用旧版 Android 拨号插件，不建立客户通话记录，也不把插件回调误判为已接通；H5 只显示插件不可用。

`pnpm build:app` 生成的是 `dist/build/app` 中的 App 资源，不是可安装 APK。APK 需要在有权使用该云端插件的 DCloud 账户中用 HBuilderX 云打包或配置好的原生离线工程生成；不要把资源编译成功当作真机插件验证。当前工作站的 HBuilderX 命令行启动时报告 Qt 处理器特性不兼容，尚无法由本机完成云打包。

## 验证范围与后续限制

- 芋道后端已提供 `/api/v1/mobile/*` 启动、配对、设备心跳、客户查询、派发接受/拒绝、拨号状态、结果回填，以及录音上传和受控读取。诊断端点也已存在。
- 本工程已接入员工登录、短期令牌刷新和一次性配对；设备撤销后只清理设备凭据，保留账户登录态。
- 通话结果成功保存后，移动端把本机录音文件作为 multipart `file` 上传，并提交随机 `upload_id`；后端校验配对设备与通话归属，再将音频加密存入客户侧私有目录，数据库不保存录音正文或本机路径。读取前先请求 `recording-access`，实际下载仍需登录令牌和配对设备密钥。移动端只把失败任务暂存在当前进程内存；应用进程退出后，未完成任务不会自动恢复。
- 通话结束写入失败时用原 `Idempotency-Key` 和 `device_event_id` 在当前进程内重试。旧工程没有安全存储插件，故不会把含通话事件的队列明文写入本地存储。应用被杀后队列无法恢复；需要选定 Android Keystore/多端安全存储方案后接入持久队列。
- 客户与通话权限必须由客户侧数据服务执行。本地展示不构成权限控制。开发模拟数据是合成样例。

## 回归检查

```sh
pnpm type-check
pnpm test
pnpm build:app
pnpm build:h5
```

测试使用 uni/native 替身验证真实 TS 模块，不拨号。资源构建不等于 APK 或真机验证，具体已通过与未验证项见 [审查报告](../../docs/reviews/2026-10-10-mobile-pc-audit.md)。
