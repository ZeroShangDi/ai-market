---
name: uniapp-safe-pack
description: 使用 HBuilderX CLI 为本仓库 uni-app 提交安心模式 Android APK，使用账号云端证书，并在用户询问时获取打包结果。
---

# uni-app 安心 APK 打包

项目为仓库根目录下 `apps/call-phone-uni`。读取当前 `src/manifest.json` 的 AppID、包名和版本；不要擅自升级依赖或改版本。既有脚本默认用于调试基座，正常 APK 使用专门命令：

```sh
cd apps/call-phone-uni
npm run pack:android:safe
```

复用 `scripts/pack-android-debug.cjs --safe-cloud-cert`，配置 `iscustom:false`、`safemode:true`、`androidpacktype:3`（当前账号云端证书）、关闭原生混淆和广告。脚本包名必须与 manifest 一致，当前为 `uni.UNID608100`。macOS 默认官方 CLI 为 `/Applications/HBuilderX.app/Contents/MacOS/cli`，其他安装位置用 `HBUILDERX_CLI` 指定。

## 执行与边界

- 确认 HBuilderX 可运行、账号已登录、项目已导入。`cli project open --path <项目绝对路径>` 可导入；登录由用户完成，不索取账号密码或导出私钥。受限环境的 Qt 处理器错误可通过正常的本机执行权限处理。
- 本会话用户已选择云端证书，并接受安心模式下桌宠原生插件提交 DCloud 编译。若未来用户要求任何源码都不上传，先解释安心模式仍提交原生插件，解决该条件后才提交。
- 前端业务代码本地合入 APK；UTS/Kotlin 插件与模块配置仍可能交给云端。自定义基座不支持安心打包；不能改为基座或回退普通打包，不能用公共证书替代指定的云端证书。
- 输出“已成功提交到云端”才算提交成功；退出码 0、编译成功、发送请求均不够。用户希望提交后结束：读取确认即报告并结束当轮，保持后台 CLI 继续执行；不等待排队、不取消已提交任务、不自行创建监控。
- 若已有任务，核对是否同一请求，避免重复提交。用户明确要求替换配置时，可取消对应旧任务后提交一次；任务归属不清则报告冲突。依赖缺失可安装官方插件后重试；服务端编译失败先定位，禁止无变化反复提交。
- CLI 输出可能包含账号 token 的推广链接，必须在输出前过滤；脚本已按行过滤。直接查询 status 也先过滤，勿展示未经处理的完整输出。临时配置不含密码，不把凭据写入仓库。

## 用户要求结果时

检查 `dist/release/apk/` 当前任务 APK 和后台 CLI 最终输出。必要时调用 `cli pack status --project <项目绝对路径>`，过滤 token，只报告匹配此次提交时间及“Android云端证书”的任务。不要把历史任务或 `dist/cache/apk` 的原生模板当成成品。

成功后确认文件存在，用 HBuilderX 的 aapt2 查看包名与版本；给绝对路径 APK 链接、大小及证书类型。未完成则报告实际排队或错误；仅问状态时不重新提交。

[官方打包 CLI](https://hx.dcloud.net.cn/cli/pack) · [安心打包说明](https://uniapp.dcloud.net.cn/tutorial/build/SafePack.html)
