# Call Phone 移动端

Vue 3 + TypeScript + uni-app 工程。页面依据 Figma 移动端画板 `2:2`、`2:20`、`2:71`、`2:112` 实现；接口以 `../../docs/modules/mobile-api-contract.md` 为基线。`62:24` 是 PC 页面，未用于本工程。

## 启动

```sh
pnpm install
cp .env.development.example .env.development
pnpm dev:h5
```

`VITE_MOBILE_MOCK=true` 仅在开发模式启用合成客户和派发数据，页面顶部会显示“开发模拟数据”。关闭开关或执行生产构建后，所有业务请求走客户侧 `/api/v1/mobile/*`；没有 `VITE_CUSTOMER_API_BASE_URL` 或短期 access token 时显示配置或认证错误。不要把真实 token 写入 Vite 环境变量、浏览器存储或日志。应用的登录集成方需在获得短期 token 后调用 `src/api/http.ts` 的 `setAccessToken()`，退出时调用 `clearAccessToken()` 并清理 `src/services/calls.ts` 中的会话状态。当前契约未定义登录/刷新端点，因此本工程不伪造登录接口。

已登录后可在“我的 → 本机与配对”输入 PC“电脑与配对”页生成的六位配对码；手机和 PC 必须使用同一员工账号。设备密钥只放在当前进程内存中，应用重启后需要重新配对。客户页在前台每 15 秒拉取派发并刷新设备心跳，后台运行/关闭客户页后不保证在线接收。

Android 代码可用 `pnpm build:app` 编译；真机需用 HBuilderX 安装含 `leven-call` 云端原生插件的自定义基座。`src/manifest.json` 延用早期 CallPhone 的插件 ID `16275` 和原 App ID，实际云打包资格与签名需在使用的 DCloud 账户下确认。H5 预览不拨真实电话。旧版插件的 `callPhone`、`registerListener`、`unRegisterListener`、`checkCallAutoRecorder`、`checkAllFilesPermission` 已封装在 `src/native/phone.ts`。插件状态仅作为候选信息，接通结果由用户确认。

“本机与配对”中的连通性测试只访问当前配置的客户侧 `/api/v1/mobile/bootstrap`：开发模拟模式会明确显示未检查真实服务，未配置地址会提示配置，401/403 表示服务可达但需要授权，404 表示移动端接口未实现。测试不记录地址或响应内容。“诊断与帮助”中的 10086 测试在用户确认后直接调用旧版 Android 拨号插件，不建立客户通话记录，也不把插件回调误判为已接通；H5 只显示插件不可用。

`pnpm build:app` 生成的是 `dist/build/app` 中的 App 资源，不是可安装 APK。APK 需要在有权使用该云端插件的 DCloud 账户中用 HBuilderX 云打包或配置好的原生离线工程生成；不要把资源编译成功当作真机插件验证。当前工作站的 HBuilderX 命令行启动时报告 Qt 处理器特性不兼容，尚无法由本机完成云打包。

## 尚待后端与产品联调

- 芋道后端已提供 `/api/v1/mobile/*` 启动、配对、设备心跳、客户查询、派发接受/拒绝、拨号状态、结果回填，以及录音上传和受控读取。移动端诊断端点尚未实现。
- 客户侧认证与 access-token 刷新由登录集成方提供；配对码由本工程领取，设备撤销后只清理设备凭据，保留账户登录态。
- 通话结果成功保存后，移动端把本机录音文件作为 multipart `file` 上传，并提交随机 `upload_id`；后端校验配对设备与通话归属，再将音频加密存入客户侧私有目录，数据库不保存录音正文或本机路径。读取前先请求 `recording-access`，实际下载仍需登录令牌和配对设备密钥。移动端只把失败任务暂存在当前进程内存；应用进程退出后，未完成任务不会自动恢复。
- 通话结束写入失败时用原 `Idempotency-Key` 和 `device_event_id` 在当前进程内重试。旧工程没有安全存储插件，故不会把含通话事件的队列明文写入本地存储。应用被杀后队列无法恢复；需要选定 Android Keystore/多端安全存储方案后接入持久队列。
- 客户与通话权限必须由客户侧数据服务执行。本地展示不构成权限控制。开发模拟数据是合成样例。
