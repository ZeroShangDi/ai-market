---
name: uniapp-safe-pack
description: 使用 HBuilderX CLI 为本仓库 uni-app 构建账号云端证书安心模式 Android APK，发布签名更新清单，并验证手机能检测和下载安装包；也支持仅提交打包或查询状态。
---

# uni-app 安心 APK 打包与版本发布

项目为仓库根目录下 `apps/call-phone-uni`。读取当前 `src/manifest.json` 的 AppID、包名和版本，以及现有签名更新清单中的版本。新版本发布需要确保 `versionCode` 高于已发布版本，`versionName` 与根目录 `CHANGELOG.md` 发布章节一致；同版本号不得替换不同内容的 APK。仅查询或重试同一次打包不改版本，不升级无关依赖。既有脚本默认用于调试基座，正常 APK 使用专门命令：

```sh
cd apps/call-phone-uni
npm run pack:android:safe
```

复用 `scripts/pack-android-debug.cjs --safe-cloud-cert`，配置 `iscustom:false`、`safemode:true`、`androidpacktype:3`（当前账号云端证书）、关闭原生混淆和广告。脚本包名必须与 manifest 一致，当前为 `uni.UNID608100`。macOS 默认官方 CLI 为 `/Applications/HBuilderX.app/Contents/MacOS/cli`，其他安装位置用 `HBUILDERX_CLI` 指定。

## 执行与边界

- 确认 HBuilderX 可运行、账号已登录、项目已导入。`cli project open --path <项目绝对路径>` 可导入；登录由用户完成，不索取账号密码或导出私钥。受限环境的 Qt 处理器错误可通过正常的本机执行权限处理。
- 本会话用户已选择云端证书，并接受安心模式下桌宠原生插件提交 DCloud 编译。若未来用户要求任何源码都不上传，先解释安心模式仍提交原生插件，解决该条件后才提交。
- 前端业务代码本地合入 APK；UTS/Kotlin 插件与模块配置仍可能交给云端。自定义基座不支持安心打包；不能改为基座或回退普通打包，不能用公共证书替代指定的云端证书。
- 输出“已成功提交到云端”才算提交成功；退出码 0、编译成功、发送请求均不够。按本仓库用户要求，常规“打包给我测试／更新安装包”应完成下方版本发布与验证，不能把云端提交当作交付完成。只有用户明确要求“只提交打包／提交后结束”时，确认提交后结束当轮并保持后台 CLI 继续执行；明确说明尚未生成或发布，手机暂时检测不到。
- 等待已有打包任务时保留日志和任务时间，间隔检查并反馈实际状态，不重复提交、不自行创建定时监控。若因环境或用户要求必须先结束，清楚列出尚未完成的发布步骤，不承诺结束后会自动发布。
- 打包期间保留本次构建资源快照；并行开发后续功能时使用独立输出目录，不覆盖安心打包待合入 APK 的资源。交付时说明安装包实际包含的变更。
- 若已有任务，核对是否同一请求，避免重复提交。用户明确要求替换配置时，可取消对应旧任务后提交一次；任务归属不清则报告冲突。依赖缺失可安装官方插件后重试；服务端编译失败先定位，禁止无变化反复提交。
- CLI 输出可能包含账号 token 的推广链接，必须在输出前过滤；脚本已按行过滤。直接查询 status 也先过滤，勿展示未经处理的完整输出。临时配置不含密码，不把凭据写入仓库。

## 用户要求结果时

检查 `dist/release/apk/` 当前任务 APK 和后台 CLI 最终输出。必要时调用 `cli pack status --project <项目绝对路径>`，过滤 token，只报告匹配此次提交时间及“Android云端证书”的任务。不要把历史任务或 `dist/cache/apk` 的原生模板当成成品。

成功后确认文件存在，用仓库 `tools/app-update/release.mjs` 的 `inspectApk`（调用 HBuilderX 的 aapt2 和 apksigner）核对包名、版本、架构和证书。未完成则报告实际排队或错误；仅问状态时不重新提交、不自动发布。用户要求交付测试包、发布更新或解决检查不到新版本时，继续下面的流程。

## 版本更新发布（仓库根目录执行）

1. 从当前发布清单和实际部署配置确认更新地址、发布目录及基准正式 APK。基准必须对应手机已有的正式签名，不能拿新包自身作基准。新旧包名、架构、签名应一致，版本号递增；不一致时停止发布并说明原因，不绕过校验，也不让用户卸载来规避签名问题。
2. 将本次实际变化归入 `CHANGELOG.md` 对应 App 版本章节，注明北京时间日期。保留后续未打进包的内容在 `[未发布]`；尚未真机验证的内容不要写成验收完成。
3. 复用现有独立签名密钥生成 APK 分发文件与签名清单；不重新生成发布私钥，不把密钥、本地发布材料或 APK 提交 Git。下面路径和地址为当前部署示例，执行前核对，不盲用历史地址：

```sh
node tools/app-update/cli.mjs prepare \
  --apk '<本次成品APK绝对路径>' \
  --baseline-apk '<上一正式版APK绝对路径>' \
  --base-url http://100.87.254.68:48080/api/v1/app-updates \
  --lan true \
  --out .local/app-update/release
```

4. 确认发布目录已被服务实际提供。当前 `apps/ruoyi-vue-pro/compose.app-update.yml` 将 `.local/app-update/release/public` 只读挂载到后台；在挂载生效时，`prepare` 会更新正在提供的文件，通常无需重启。若部署位置变化，只同步 `public` 目录，先放置 APK，再切换清单，保留旧 APK。`prepare` 成功仅代表材料生成，不能证明手机地址已更新；不要为了静态更新无故重启业务或工作服务。
5. 用手机使用的更新地址执行端到端验证：

```sh
node scripts/smoke-app-update.mjs \
  .local/app-update/release/client.env \
  '<上一正式版APK绝对路径>'
```

必须确认返回版本是本次目标版本、旧版状态为 `available`、目标版为 `upToDate`，并通过匿名清单签名、完整下载、大小/摘要、同证书以及 HEAD/Range 检查。验证失败则定位发布路径、缓存、网络或签名问题，不降低客户端校验要求。实际 Android 安装仍由真机确认。

6. 记录真实发布和验证结果，按仓库提交规则提交相关代码、配置与更新日志。最终报告版本号、手机已可检测的验证结果、APK 链接及未验证事项。只有安装包与签名清单均在实际更新地址可用且验证通过，才可说“已发布，可以检查更新”；排队、打包成功和发布成功应分别说明。

[官方打包 CLI](https://hx.dcloud.net.cn/cli/pack) · [安心打包说明](https://uniapp.dcloud.net.cn/tutorial/build/SafePack.html)
