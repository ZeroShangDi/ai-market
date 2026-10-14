# 1.0.8 更新链路交付

日期：2026-10-15，北京时间。以此记录覆盖此前交接中的「尚未接通」状态。

## 安装包

`apps/call-phone-uni/dist/release/apk/tongzige-1.0.8-20261015-update.apk`

- 版本 1.0.8（106），包名 uni.UNID608100，AppID __UNI__D608100，arm64-v8a。
- 24,990,673 字节，SHA256 `b5a2e73e47529a52fc0af64b137a2cf892e6ae07cc64601deb11561821c45899`。
- 使用原个人证书，原生 dex/so 与 1.0.7 完全一致，原运行时发布配置保留，仅更新版本和前端资源。
- 带实际发布源、公钥及精确授权 HTTP origin：`http://100.87.254.68:48080`。它与用户手机现有配对/业务访问入口一致，不更改配对身份。
- 从 HEAD 的移动端与资源文件建立临时发布目录，再仅覆盖本聊天的导航、图标和更新改动构建。未把工作区中其他任务未提交的 AI 对话等改动混入本次 APK。

## 后端部署

- 独立 AppUpdateController 提供签名清单和 APK 文件，PermitAll/TenantIgnore，不依赖业务身份或数据库。
- 路径参数限制格式，真实文件路径必须仍位于发布目录内，拒绝越界符号链接；默认只读、清单 no-cache、APK 内容寻址。
- 使用原 Compose 文件列表，追加 compose.app-update.yml，只读挂载 `.local/app-update/release/public`；私钥在外层，未进入容器或 APK。
- 后台已重建部署。继续监听原有 `127.0.0.1:48080` 和 `100.87.254.68:48080`，AI/Agent服务和数据库数据卷保留。
- 曾尝试额外 LAN IP 监听，与 Docker Desktop 端口映射冲突后已撤回；最终包使用用户实际的 Tailscale 入口，未要求重新配对。

检查接口：`http://100.87.254.68:48080/api/v1/app-updates/uni.UNID608100/android/arm64-v8a/stable/manifest.json`。

APK 下载接口：`/api/v1/app-updates/uni.UNID608100/apk/106-b5a2e73e47529a52fc0af64b137a2cf892e6ae07cc64601deb11561821c45899.apk`。

## 验证

- 新增后端 MVC 测试 3 项通过：匿名原始清单、下载/HEAD/Range、缺失与非法路径/越界符号链接。
- 工作区移动端测试 145 项通过；隔离发布目录完整测试 140 项通过（不含其他任务新增用例），类型检查通过；App 构建完成。
- 发布/CHANGELOG 工具测试 10 项通过；覆盖精确授权的私网/Tailscale origin 与公网 HTTP 拒绝。
- 签名 v1/v2 校验、同证书校验、ZIP 完整性、16 KB ZIP 对齐、原生材料逐文件一致性及 App 编译资源逐文件一致性通过。
- 从实际 Tailscale HTTP 地址匿名获取签名清单，真实下载完整 APK，验证大小、SHA256、包名、版本和证书通过；HEAD 和 bytes=0-31 请求通过。
- 使用实际 TypeScript 更新核心与版本源执行网络验收：旧 1.0.7 身份为 available，1.0.8 身份为 upToDate；未模拟服务端成功响应。
- Android 设备未连接：系统安装器权限、取消、真实覆盖安装和重启后版本读取仍待用户在手机确认。网络验收不代表手机安装验收已完成。

## 使用和发布

首次手动覆盖安装 1.0.8，无需卸载。电脑后台、手机与电脑 Tailscale 保持可用，打开「我的 → 应用更新」检查。当前发布最新就是 1.0.8，应提示已经是最新版本；以后发布递增版本，会变为更新按钮，点击下载后调用系统安装。

后续将新版本签名 APK 与对应 CHANGELOG 交给 `tools/app-update/cli.mjs prepare`，沿用同一密钥、地址、包名和证书，原子更新清单后无需重启后台。完整命令见 [发布说明](../../tools/app-update/README.md)。

仓库本地 CHANGELOG 提交检查已启用；此次只提交本聊天的版本、导航/图标及更新链路代码，不包含其他任务的 AI/Agent 改动，不自动推送远端。
