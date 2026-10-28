# 通用应用更新模块

状态：2026-10-15。已复用现有后台提供独立公共检查/下载路由，并使用手机现有的 `100.87.254.68:48080` Tailscale 地址验证真实下载。1.0.8 已带发布配置，首次需覆盖安装一次。Android 系统安装仍待手机确认。最新验收见[交付记录](../reviews/2026-10-15-lan-app-update-release.md)。

## 当前交互

- 「我的 → 应用更新」左侧灰字显示实际安装版本，读取前回退到构建版本；右侧为「检查更新」。
- 手工检查无新版，提示「已经是最新版本」；有新版，按钮变为「更新」。手工检查不会额外弹出自动提示。
- App 启动/回到前台自动检查，成功检查最多每小时一次。发现新版本显示居中卡片，包含版本、包大小、1～3 条摘要和「立即更新 / 跳过此版本」。关闭按钮仅收起本次提醒，跳过按钮持久保存偏好。
- 跳过按 App、渠道和 versionCode 保存在本机，不再自动提示同一版本；手工检查仍能更新。下一版本重新提示。
- 提醒点击更新后原位切换到进度弹窗，无需跳转「我的」。我的页面也复用此弹窗；关闭后下载继续，可再次查看进度，返回键只关闭窗口。弹窗区分下载、校验、安装，允许取消下载与重试可恢复错误，并提供安装权限入口；校验拒绝时不允许继续安装。
- 更新按钮完成下载、校验后直接请求 Android 系统安装；仍由用户在系统界面确认。弹窗以独立透明页面承载，复用单例服务，在登录页等任意页面均可显示，不依赖业务账号。
- 回到前台先核对实际安装版本，再执行检查频率限制；发起安装请求不等于安装成功。

## 独立性

更新是基础功能，不读取通话、客户、配对、账号或业务服务配置；不会阻止新外呼或等待通话结果保存。不再注入业务安装许可，不提供业务强制更新策略。Release 中保留 mandatory 字段以兼容已定义清单，但当前 UI 始终允许跳过，发布工具固定生成 false。

- core.ts：检查、下载、取消、校验、安装和版本核对；平台/版本源通过参数注入。
- source.ts：从独立配置的 HTTPS 或明确授权的局域网/Tailscale 地址读取签名清单，不附带业务登录令牌或设备密钥。
- android.ts：读取 Android 安装版本、原生下载器、清单签名与 APK 校验、请求系统安装。
- presenter.ts：检查频率、弹窗、跳过偏好、版本文字和按钮状态。
- services/updates.ts：配置组装，不依赖通话模块。
- components/AppUpdateRow.vue：我的页面中的版本与操作入口。
- components/AppUpdateDialog.vue / pages/app-update/index.vue：共用更新卡片和透明弹窗页面；presentation.ts 负责短摘要兜底与展示状态。

## 发布源

配置：VITE_UPDATE_MANIFEST_URL、VITE_UPDATE_PUBLIC_KEY（RSA SPKI DER base64 公钥）、VITE_UPDATE_DOWNLOAD_ORIGINS（允许的 origin 列表）、VITE_UPDATE_CHANNEL（默认 stable）。局域网/Tailscale HTTP 另需 VITE_UPDATE_LAN_ORIGINS 精确授权。未配置时，自动检查安静退出，手工检查明确提示发布源未配置，不误报最新版。

清单格式：`{ "payload": "精确 JSON 文本", "signature": "RSA-SHA256 base64 签名" }`；签名针对 payload 原始 UTF-8 字节。payload 为 `{ "release": null }` 或 `{ "release": { ... } }`，完整字段见 core.ts 的 Release。客户端公钥来自构建配置，不能从响应中取得并信任。

下载前校验发布签名和允许域名；下载后及安装前校验 APK 大小、SHA256、包名、版本号及与当前安装应用相同的签名证书。清单来源不可达、签名失败和无更新分别处理。

完整的密钥初始化、真实 APK 核验、独立摘要校验、生成静态发布目录和客户端配置流程见 [发布工具](../../tools/app-update/README.md)。发布工具复用 scripts/sign-app-release.mjs 的签名实现。手机摘要与完整 CHANGELOG 分开维护，默认文件为 `docs/releases/<versionName>.json`；旧清单超长内容使用简短通用说明兜底，不直接截取技术日志。

## 当前部署选择

短期复用现有后台的独立 update 包提供两个公开文件接口，读取 APP_UPDATE_STORAGE_ROOT，不查数据库、客户、账号、订阅或配对；后续连同版本管理迁往管理服务。发布文件与私钥、录音目录隔离，仅公开 public/。清单与 APK 均无业务认证及租户要求。

1.0.7 没有发布配置，需先手动覆盖安装已配置的 1.0.8。此后发布更高版本即可在手机发现。当前使用 Tailscale HTTP 精确 origin，公网部署仍推荐 HTTPS。

## 变更日志与提交

根目录 CHANGELOG.md 持续记录变化。每次代码/配置/资源提交，必须在同次提交中增加对应日志条目；纯 Markdown 文档可免。根 AGENTS.md 写明规则；`.githooks/pre-commit` 通过 scripts/check-changelog.mjs 检查暂存区，防止只修改日志但未暂存。新克隆运行 `node scripts/install-git-hooks.mjs`。

开发阶段追加「未发布」，正式发布时归档到 `[版本号] - 日期`，与 APK 实际 versionName 对应。发布工具不会自动将未完成内容写入更新弹窗。

## 验证与限制

- 已有测试覆盖手工/自动检查、跳过持久化、按钮转换、下载/校验/安装、重复点击、返回前台版本核对，以及发布签名和 CHANGELOG 提交检查。
- 仅支持 Android 完整 APK，不支持 WGT、iOS 或 Electron；签名轮换未支持。
- 原生下载器不能完整观察重定向，分发使用最终可访问 URL，公网使用 HTTPS。
- 尚待真机检查系统安装权限拒绝、取消、真实覆盖升级与进程重启后的版本确认。
