# 独立应用更新发布工具

当前通过现有后台的独立公共路由分发本地文件，不引入版本数据库或管理页面。客户端检查签名 JSON 和 APK 版本；接口不依赖业务登录，后续可以整体迁移到管理服务。

## 初次准备

在仓库根目录使用 Node 22.13+：

```sh
node scripts/install-git-hooks.mjs
node tools/app-update/cli.mjs init-key
```

发布私钥默认保存为 `.local/app-update/release-private.pem`，权限 600，目录已被 Git 忽略。它与 Android APK 签名证书是不同的密钥，需单独备份。命令拒绝覆盖已存在密钥；以后发布持续使用同一把密钥，公钥随客户端构建。私钥不得上传到分发站点或放入 APK。

## 准备发布

1. 完成当前版本验证，递增 manifest.json 的 versionName/versionCode。
2. 将 CHANGELOG.md 的「未发布」内容归入 `## [实际版本] - 日期`。不要把尚未完成的下一版内容夹入本次说明。
   同时编写 `docs/releases/<实际版本>.json` 的手机摘要，格式见 [摘要约定](../../docs/releases/README.md)。AI 按本次实际变化提炼 1～3 条用户可感知的短句，每条最多 32 字、总计最多 90 字，不把完整工程日志放进弹窗。
3. 生成个人证书签名的正式 APK。
4. 运行以下命令，使用真实的 HTTPS 分发根地址替换示例地址：

```sh
node tools/app-update/cli.mjs prepare \
  --apk /绝对路径/新正式包.apk \
  --baseline-apk /绝对路径/原正式包.apk \
  --base-url https://你的更新域名 \
  --out .local/app-update/release
```

工具会实际读取 APK 的包名、版本和架构，并使用 apksigner 验证目标包与基准包的签名证书一致。当前支持单架构 APK，默认包名 `uni.UNID608100`、AppID `__UNI__D608100`、渠道 stable。版本名称和版本号来自 APK，不手工猜测。

手机说明默认读取 CHANGELOG 所在目录下的 `docs/releases/<APK versionName>.json`，也可用 `--notes /路径/摘要.json` 指定。摘要缺失、版本不符或超过长度限制时拒绝发布，不会截取 CHANGELOG 代替。签名清单仍使用原有 `notes` 字符串（每条一行），旧客户端也会收到简短说明。

macOS 默认复用已安装的 HBuilderX 内置 aapt2、JRE 和 apksigner。其他环境通过 AAPT2、JAVA_BIN、APKSIGNER_JAR 指定 Android 工具。HBuilderX 安装位置可通过 HBUILDERX_HOME 指向其 Contents/HBuilderX 目录。

输出包括：

- `public/uni.UNID608100/apk/<版本号>-<SHA256>.apk`：不可变安装包地址。
- `public/uni.UNID608100/android/arm64-v8a/stable/manifest.json`：RSA-SHA256 签名清单，含版本、更新内容、APK 大小和摘要。
- `client.env`：对应的四个客户端公开构建配置，不包含私钥。

同渠道不允许发布较低版本，或用相同 versionCode 替换不同 APK。工具先复制并校验安装包，再原子替换版本清单。更换签名私钥时拒绝覆盖旧清单；签名轮换需单独设计。

## 接通分发

只部署输出中的 **public/** 目录。可以由独立静态站点或对象存储通过 HTTPS 提供，不要求建设动态管理员后端。使用未部署的地址时，prepare 只代表本地材料已生成。当前 Tailscale 地址已通过实际下载验证，未来公网环境建议使用 HTTPS。

- manifest.json 使用 `Cache-Control: no-cache`，让客户端能发现新版本。
- 含摘要的 APK 地址可使用长期不可变缓存，Content-Type 为 `application/vnd.android.package-archive`。
- 使用最终可访问的 HTTPS 地址，不依赖重定向。原生下载器尚不能完整观察逐跳重定向。
- 将 client.env 中的配置合并到移动端 `.env.production.local`；不要覆盖该文件里的其他配置。先验证公网清单和 APK 可达，再构建带此配置的初始安装包。
- 已安装但未配置发布源的 1.0.7，仍需要手动覆盖安装一次带配置的版本；后续版本才可通过应用内更新取得。

如使用 NGINX，按[官方静态文件配置](https://docs.nginx.com/nginx/admin-guide/web-server/serving-static-content/)将站点根目录指向 public/，TLS 和域名由部署环境提供。不要把仓库根目录、发布私钥目录或业务存储目录映射为公开站点。

## 检查

```sh
node --test tools/app-update/test.mjs scripts/check-changelog.test.mjs
pnpm --dir apps/call-phone-uni test
pnpm --dir apps/call-phone-uni type-check
pnpm --dir apps/call-phone-uni build:app
```

单元测试使用替代 APK 检查器测试签名/版本/发布流程；真实 APK 检查由 prepare 的本地演练另行验证。Android 系统安装权限、用户取消及覆盖安装后的版本读取仍需真机验收。

## 当前 Tailscale 分发与后续发布

手机当前使用 `100.87.254.68:48080` 配对，新包的更新检查与下载也使用此地址，无需重新配对。电脑、后台和手机 Tailscale 连接需保持可用。

- 检查：`GET /api/v1/app-updates/uni.UNID608100/android/arm64-v8a/stable/manifest.json`
- 下载：`GET /api/v1/app-updates/uni.UNID608100/apk/<版本号>-<SHA256>.apk`，支持 HEAD/Range。
- 文件：`.local/app-update/release/public/`。Compose 文件列表中追加 `-f compose.app-update.yml`，仅此目录只读挂载；继续保留原 compose.tailscale.yml，不重置数据卷。

`--lan true` 仅允许显式配置的 RFC1918 / 100.64.0.0/10 IPv4 HTTP origin；客户端配置同时生成 VITE_UPDATE_LAN_ORIGINS，不允许任意公网 HTTP。

生成初始包前可先取得客户端公开配置：

```sh
node tools/app-update/cli.mjs client-config --base-url http://100.87.254.68:48080/api/v1/app-updates --lan true --out .local/app-update/client.env
```

把输出的 VITE_UPDATE_* 合并到移动端 `.env.production.local`（保留其他配置），构建并签名 APK，然后发布：

```sh
node tools/app-update/cli.mjs prepare --apk /路径/新版本.apk --baseline-apk /路径/原正式包.apk --base-url http://100.87.254.68:48080/api/v1/app-updates --lan true --out .local/app-update/release
node scripts/smoke-app-update.mjs .local/app-update/release/client.env /路径/原正式包.apk
```

每个新包递增 versionCode，并归档对应 CHANGELOG；发布后不必重启后台。网络 smoke 执行真实清单获取、签名/摘要/证书核验、版本判断及文件下载，不调用手机系统安装。

仅页面资源变化时可用 `python3 scripts/pack-android-offline.py --baseline 原正式包 --assets 已编译App资源 --output 新APK` 复用原生材料并本地签名。插件、权限发生变化时需重新原生构建；脚本验证原生代码、证书及编译资源一致性，不替代真机安装验证。
