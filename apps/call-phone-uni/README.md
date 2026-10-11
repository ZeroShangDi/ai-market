# Call Phone 移动端

Vue 3 + TypeScript + uni-app 工程。页面依据 Figma 移动端画板 `2:2`、`2:20`、`2:71`、`2:112` 实现；接口以 `../../docs/modules/mobile-api-contract.md` 为基线。`62:24` 是 PC 页面，未用于本工程。

## 启动

```sh
pnpm install
cp .env.development.example .env.development
pnpm dev:h5
```

`VITE_MOBILE_MOCK=true` 仅在开发模式启用合成客户和派发数据；生产构建强制走真实接口。真实模式进入登录页，可设置服务地址、工作区 ID，并使用现有芋道员工账号登录（与 PC 相同）。登录与刷新复用 `/admin-api/system/auth/*`；启用滑块验证码的服务器通过现有 captcha/get、captcha/check 协议完成验证。access/refresh token 仅存进程内存。Android 设备身份使用系统 Keystore AES-GCM 安全保存；重启仍需员工登录，成功后校验并恢复原设备身份，无需普通重复配对。服务地址、工作区、员工与设备隔离保存。H5/iOS 暂不支持安全持久化，界面明确提示。

已登录后在“我的 → 本机与配对”扫码或输入 PC“电脑与配对”页生成的六位配对码。二维码只包含一次性配对码、工作区和可选服务地址；不同工作区或服务地址会拒绝认领，需先以正确配置重新登录。APP 扫码使用 uni.scanCode，H5 请手工输入。应用前台服务每 15 秒拉取派发并刷新心跳，工作台/我的/详情/客户列表共用顶栏入口；页面切换不停止，进入后台停止。可以接受并拨号或拒绝派发，通话后确认实际结果和同步录音。

手机不能通过自己的 localhost 访问电脑后端。请使用手机可达的服务域名或电脑局域网地址，并使 PC、手机的 tenant-id 一致。本地 Compose 默认只监听回环地址，可通过 `CALLPHONE_API_BIND_HOST=电脑局域网IP` 单独配置 API 监听地址；数据库与 Redis 仍只监听回环地址。完整的联调步骤见 [验收清单](../../docs/reviews/mobile-pc-acceptance.md)。公网服务使用 HTTPS。

所有页面采用自定义导航，关闭 App 原生空 titleNView；统一顶栏处理状态栏与安全区域，仍引用原 `static/figma/*.svg` 图标。改变 Barcode/native 模块后须重建自定义基座；仅热更新页面资源不能补齐原生扫码模块。

Android 代码可用 `pnpm build:app` 编译；真机需用 HBuilderX 安装含 `leven-call` 云端原生插件的自定义基座。`src/manifest.json` 延用早期 CallPhone 的插件 ID `16275` 和原 App ID，实际云打包资格与签名需在使用的 DCloud 账户下确认。H5 预览不拨真实电话。旧版插件的 `callPhone`、`registerListener`、`unRegisterListener`、`checkCallAutoRecorder`、`checkAllFilesPermission` 已封装在 `src/native/phone.ts`。插件状态仅作为候选信息，接通结果由用户确认。

“本机与配对”中的连通性测试只访问当前配置的客户侧 `/api/v1/mobile/bootstrap`：开发模拟模式会明确显示未检查真实服务，未配置地址会提示配置，401/403 表示服务可达但需要授权，404 表示移动端接口未实现。测试不记录地址或响应内容。“诊断与帮助”中的 10086 测试在用户确认后直接调用旧版 Android 拨号插件，不建立客户通话记录，也不把插件回调误判为已接通；H5 只显示插件不可用。

`pnpm build:app` 生成的是 `dist/build/app` 中的 App 资源，不是可安装 APK。APK 需要在有权使用该云端插件的 DCloud 账户中用 HBuilderX 云打包或配置好的原生离线工程生成；不要把资源编译成功当作真机插件验证。当前工作站的 HBuilderX 命令行启动时报告 Qt 处理器特性不兼容，尚无法由本机完成云打包。

Android 云打包包名固定为 `uni.UNID608100`（大小写保持一致），与已购 `leven-call` 插件绑定包名一致。源码通过 `app-plus.distribute.android.packagename` 配置实际包名，插件元数据中的 `android_package_name` 不能代替该配置。重新构建资源后，在 HBuilderX 云打包或自定义基座窗口核对“Android 包名”为 `uni.UNID608100`；若窗口仍保留 `uni.app.unid608100`，改为前者再提交。DCloud AppID 保持 `__UNI__D608100`。

## 验证范围与后续限制

- 芋道后端已提供 `/api/v1/mobile/*` 启动、配对、设备心跳、客户查询、派发接受/拒绝、拨号状态、结果回填，以及录音上传和受控读取。诊断端点也已存在。
- 本工程已接入员工登录、短期令牌刷新和一次性配对；设备撤销后只清理设备凭据，保留账户登录态。
- 通话结果成功保存后，移动端把本机录音文件作为 multipart `file` 上传，并提交随机 `upload_id`；后端校验配对设备与通话归属，再将音频加密存入客户侧私有目录，数据库不保存录音正文或本机路径。读取前先请求 `recording-access`，实际下载仍需登录令牌和配对设备密钥。Android 在发送前加密保存结果与上传任务，并将录音复制至应用私有 no-backup 目录。重新登录同一服务、工作区、员工及设备后恢复；未能安全保存时保留通话锁并提示，不能视为已保存。
- 通话结果使用原 `Idempotency-Key` 和 `device_event_id` 恢复；录音保留原 `upload_id`。网络恢复、前台轮询和手工入口共用单一重试，临时错误最多自动尝试 5 次；认证/永久错误展示处置状态，永久失败不阻塞其余任务。
- 客户与通话权限必须由客户侧数据服务执行。本地展示不构成权限控制。开发模拟数据是合成样例。

## 回归检查

```sh
pnpm type-check
pnpm test
pnpm build:app
pnpm build:h5
```

测试使用 uni/native 替身验证真实 TS 模块，不拨号。资源构建不等于 APK 或真机验证，具体已通过与未验证项见 [审查报告](../../docs/reviews/2026-10-10-mobile-pc-audit.md)。


## 应用更新

通用流程位于 `src/modules/app-update`，业务安装许可由 `src/services/updates.ts` 注入；启动检查与“我的”手工入口复用同一任务。仅接入 Android APK 适配，未验证的其他平台明确不支持。正式发布需配置签名版本源、公钥和下载域；示例见 `.env.development.example` 及[更新模块文档](../../docs/modules/app-update-module.md)。更新 API 不携带业务 token 或设备密钥。

本轮实施和实际验证边界见[修复记录](../../docs/reviews/2026-10-10-uni-remediation-progress.md)。Keystore/原生插件/系统安装均仍需真实基座验证。
