# Call Phone 移动端

Vue 3 + TypeScript + uni-app 工程。页面依据 Figma 移动端画板 `2:2`、`2:20`、`2:71`、`2:112` 实现；接口以 `../../docs/modules/mobile-api-contract.md` 为基线。`62:24` 是 PC 页面，未用于本工程。

## 启动

```sh
pnpm install
cp .env.development.example .env.development
pnpm dev:h5
```

`VITE_MOBILE_MOCK=true` 仅在开发模式启用合成数据；生产构建使用真实接口。员工先在 PC 登录，在“电脑与配对”填写手机可访问的服务地址（按本电脑与工作区保存），再创建二维码。Android App 直接进入空白工作台，通过左上角扫码，即可登录该员工并配对；不再填写账号、密码、工作区或地址。

二维码 v2 包含服务 origin、工作区、配对 ID、六位码及 256 位一次性登录凭证，5 分钟有效。服务端仅保存凭证哈希，领取后原子失效。扫码签发的会话限定移动端接口，不能作为 PC 管理会话使用。Android 使用系统 Keystore AES-GCM 保存设备身份；access/refresh token 只存内存。重启通过设备密钥自动获取新会话；短期令牌和刷新令牌过期后亦可恢复。网络暂不可达保留设备身份以便重试；主动退出清除自动登录身份，解绑/撤销后服务端拒绝恢复。H5/iOS 暂不提供该安全扫码登录流程。

应用前台每 3 秒拉取派发并刷新心跳。电脑发起的有效派发由手机前台自动接受并拨号，无需进入客户页或逐次确认；已有未完成通话时等待结果保存。通话后确认预选结果、可选备注并点击一次保存。

手机不能通过自己的 localhost 访问电脑后端。请使用手机可达的服务域名或电脑局域网地址，并使 PC、手机的 tenant-id 一致。本地 Compose 默认只监听回环地址，可通过 `CALLPHONE_API_BIND_HOST=电脑局域网IP` 单独配置 API 监听地址；数据库与 Redis 仍只监听回环地址。完整的联调步骤见 [验收清单](../../docs/reviews/mobile-pc-acceptance.md)。公网服务使用 HTTPS。

所有页面采用自定义导航，关闭 App 原生空 titleNView；统一顶栏处理状态栏与安全区域，仍引用原 `static/figma/*.svg` 图标。改变 Barcode/native 模块后须重建自定义基座；仅热更新页面资源不能补齐原生扫码模块。

Android 代码可用 `pnpm build:app` 编译；真机需用 HBuilderX 安装含 `leven-call` 云端原生插件的自定义基座。`src/manifest.json` 延用早期 CallPhone 的插件 ID `16275` 和原 App ID，实际云打包资格与签名需在使用的 DCloud 账户下确认。H5 预览不拨真实电话。旧版插件的 `callPhone`、`registerListener`、`unRegisterListener`、`checkCallAutoRecorder`、`checkAllFilesPermission` 已封装在 `src/native/phone.ts`。明确的结束时长可预选接通结果，用户可修正后保存。

“本机与配对”中的连通性测试只访问当前配置的客户侧 `/api/v1/mobile/bootstrap`：开发模拟模式会明确显示未检查真实服务，未配置地址会提示配置，401/403 表示服务可达但需要授权，404 表示移动端接口未实现。测试不记录地址或响应内容。“诊断与帮助”中的 10086 测试在用户确认后直接调用旧版 Android 拨号插件，不建立客户通话记录，也不把插件回调误判为已接通；H5 只显示插件不可用。

`pnpm build:app` 生成的是 `dist/build/app` 中的 App 资源，不是可安装 APK。APK 需要在有权使用该云端插件的 DCloud 账户中用 HBuilderX 云打包或配置好的原生离线工程生成；不要把资源编译成功当作真机插件验证。当前工作站的 HBuilderX 命令行启动时报告 Qt 处理器特性不兼容，尚无法由本机完成云打包。

Android 云打包包名固定为 `uni.UNID608100`（大小写保持一致），与已购 `leven-call` 插件绑定包名一致。源码通过 `app-plus.distribute.android.packagename` 配置实际包名，插件元数据中的 `android_package_name` 不能代替该配置。重新构建资源后，在 HBuilderX 云打包或自定义基座窗口核对“Android 包名”为 `uni.UNID608100`；若窗口仍保留 `uni.app.unid608100`，改为前者再提交。DCloud AppID 保持 `__UNI__D608100`。

## 验证范围与后续限制

- 芋道后端已提供 `/api/v1/mobile/*` 启动、配对、设备心跳、客户查询、派发接受/拒绝、拨号状态、结果回填，以及录音上传和受控读取。诊断端点也已存在。
- 本工程已接入扫码登录、设备自动恢复和短期令牌刷新；设备撤销后不能继续访问移动接口。
- 通话结果成功保存后，移动端把本机录音文件作为 multipart `file` 上传，并提交随机 `upload_id`；后端校验配对设备与通话归属，再将音频加密存入客户侧私有目录，数据库不保存录音正文或本机路径。读取前先请求 `recording-access`，实际下载仍需登录令牌和配对设备密钥。Android 在发送前加密保存结果与上传任务，并将录音复制至应用私有 no-backup 目录。自动恢复同一服务、工作区、员工及设备会话后恢复；未能安全保存时保留通话锁并提示，不能视为已保存。
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

## 1.0.4 拨号体验调整

- 工作台右上角直接打开扫码相机，复用“我的”扫码配对流程；配对时提示电脑外呼将在手机前台自动执行。
- “我的”账户、设备、诊断面板以右上角关闭按钮退出，不再显示仅关闭弹窗的“完成”。服务授权说明明确区别于电话权限与设备配对。
- 电脑客户列表、客户详情、线索跟进和有客户关联的通话记录重拨均直接发送请求；一部 Android 手机在线时无需额外选择，多部在线时首次选择目标，后续复用当前仍在线的选择。
- 手机在任意页面前台自动执行有效派发，结果面板全局展示；重复派发、忙线、过期请求和旧会话均受保护。App 后台或锁屏自动拨号未实现，不应视为后台常驻服务。
- 需重新构建并安装 1.0.6（104）；本轮未改变原生模块与包名。

通话结果面板仅保留“保存结果”，不再需要单独人工确认结束或二次弹窗。明确的结束回调且时长大于 0 时预选“已接通”；插件未接通回调默认预选“无人接听”，但该回调也可能表示对方拒接，用户可修改。只有挂断而没有接通证据时不强行归类。用户手工选择优先于后续插件建议；备注可选。没有结束回调时，用户点击保存同时记录结束，延迟时长/录音仍沿用原补充同步机制。

## 1.0.5 扫码登录验收

数据库需执行 `callphone-v57-mobile-qr-login.sql`（本机已执行）。新增 `/api/v1/mobile/session/scan` 和 `/resume`，请求和响应凭据均关闭访问日志正文记录。扫码请求字段为 `pairingId / pairingCode / loginSecret / displayName`；恢复请求为 `deviceId / deviceKey`，均携带 `tenant-id`。响应为 `userId / deviceId / accessToken / refreshToken`，仅扫码首次返回 `deviceKey`。

已通过 46 项前端逻辑测试、22 项后端测试、App/H5/PC 构建及真实接口扫码/重放拒绝/恢复/租户隔离/权限隔离/刷新后隔离/解绑拒绝验证。还需安装新版 APK 验证 Android 安全存储跨重启与插件真实拨号。

## 1.0.6 启动和后台试验

全局启动权限申请与状态检查位于 `src/modules/device-readiness`，手机宠独立模块位于 `src/modules/mobile-pet`。用户主动开启并授权悬浮窗后，后台继续尝试已有派发轮询；系统休眠或杀进程仍可能中断，不承诺常驻和开机唤醒。工作台保持空白、扫码入口左侧，自动登录恢复由 App 全局执行。“我的”按检查项/状态同排、操作分组布局展示。

APK 桌面与应用声明图标已解包核对，新增 Android mdpi 图标。云打包需保留项目根目录 static/app-icons 与 src/static/app-icons 同名素材。原生权限清单发生变化，需重新云打包安装，热更新资源不够。
