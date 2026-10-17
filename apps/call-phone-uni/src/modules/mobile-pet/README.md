# 可迁移手机桌宠

桌宠由本目录和 `src/uni_modules/portable-pet-overlay` 共同组成。Android 原生窗口使用 EasyFloat 2.0.4（Apache-2.0），通过 UTS 桥接，不再通过 Native.js 创建 UI。支持拖动、靠边停靠、点击返回宿主、按住至少 650ms 后松开展开动作菜单，以及本地视频透明合成动画。

## 分层与独立迁移

- `controller.ts`：独立于 Vue/uni 的状态机，注入平台适配器、存储和状态对象；负责开关、串行协调、过期请求、权限复查与释放。
- `transport.ts`：原生协议校验、超时与事件订阅，无应用业务依赖。
- `android.ts`：uni 平台和资源路径适配；`appearance.ts` / `static/mobile-pet` 提供完整动作目录与视频。
- `index.ts`：Vue 响应式门面，只暴露桌宠能力。
- `uni_modules/portable-pet-overlay`：独立原生插件，负责视图、动画、触摸、权限入口与窗口资源。
- `services/pet-status.ts`：**宿主业务**负责把通话/连接状态转为文本，不属于桌宠模块。后台轮询策略也留在 `services/foreground.ts`。

后续独立：复制 `modules/mobile-pet`、`static/mobile-pet` 与 `uni_modules/portable-pet-overlay`，确保 `@` 指向新项目 `src`，配置匹配的 UTS 编译器；使用自己的存储键调用 `configureMobilePet`。原生包不含账号、电话、服务器地址或当前应用 ID。若使用非 Vue 宿主，可直接复用 controller/transport 并自行注入适配器。一个运行实例管理一个桌宠窗口，多角色并发不在当前协议范围内。

## 宿主接口

首次启动前调用 `configureMobilePet({ preferenceKey })`，原应用继续使用 `callphone.mobile-pet.enabled` 保留用户选择。App onShow 调用 `refreshMobilePet()`，设置开关调用并等待 `setMobilePetEnabled(boolean)`；状态文本使用 `setMobilePetText(string)`，最多 80 字符。`onPetChange` 返回取消订阅函数。

`isPetActive()` 仅在开关开启、最近确认窗口已挂载、当前悬浮权限已允许时为 true。它不是后台服务存活或系统未遮挡窗口的保证。每 5 秒复查挂载和权限；系统暂停 JS 时复查也会暂停。`disposeMobilePet()` 为终止接口，清理定时器、监听与原生窗口；清理失败可重试 dispose，释放后不能重新开启同一控制器。

## 构建与调试

需要支持 UTS Kotlin 混编的 HBuilderX（建议与项目 uni-app 编译版本一致，至少 4.81）、Android API 23+。CLI 依赖 `@dcloudio/uni-uts-v1` 与其他 `@dcloudio` 包保持相同精确版本。普通 `build:app` 生成 JS 资源，并不代表原生插件已编译进 APK。

1. HBuilderX 打开本 uni-app 工程，检查 `uni_modules/portable-pet-overlay`、Android 清单与 Maven 依赖完整。
2. 制作包含本地 UTS 插件及宿主 `leven-call` 插件的**自定义调试基座**，打包环境需要访问 JitPack 下载 EasyFloat 2.0.4。
3. 安装后在“运行到手机”选择自定义基座。标准基座不能作为本插件已装入的验收依据；切换包名后需重新授权该应用。
4. 允许显示在其他应用上层，返回应用开启手机宠。后续修改 Kotlin、原生依赖或清单后重新编译原生部分/基座；不能仅发布 WGT 添加原生插件。

未加载插件会提示使用包含插件的自定义基座或安装包，不再误认为窗口显示成功。H5/iOS 暂不支持系统桌宠。

### HBuilderX CLI 自定义基座

在已安装并登录 HBuilderX 的电脑上，从 `apps/call-phone-uni` 执行 `npm run pack:android:debug`。入口使用临时 JSON 配置调用官方 `cli pack --config`，Android 包名沿用 `uni.UNID608100`，使用自定义基座、普通云打包和公共测试证书，关闭广告。自定义基座不支持安心打包。macOS 默认 CLI 路径为 `/Applications/HBuilderX.app/Contents/MacOS/cli`；其他安装位置通过 `HBUILDERX_CLI` 指定完整可执行文件路径。

首次打包可能需要先安装官方依赖插件，云打包排队时间由 DCloud 决定。入口不保存登录凭据或证书密码，并过滤 CLI 输出中的账号 token 链接；CLI 返回 0 但只提示下载依赖等未完成状态时，入口返回失败，以免误认为已生成 APK。这是调试基座入口，正式 APK 需要使用正式签名和发布配置。

## 已处理边界

连续开关与并发刷新、旧创建回调、创建 5 秒超时与桥接 8 秒超时、失败与授权撤销、真实挂载校验、关闭失败检查/兜底卸载、Activity 销毁、低内存、旋转后边界修正、重复释放、异常宿主回调、拖动与长按冲突、多指/取消触摸、素材尺寸与帧参数限制、文件与 APK assets 两种资源读取。

不增加原生前台 Service，不承诺锁屏/进程被杀后持续运行。小米的后台弹出界面、省电、自启动规则仍需实机验证；悬浮授权不是电话/麦克风等普通权限的替代。

## 验证与实机验收

`npm test` 覆盖状态机与桥接边界。`tests/native/PetGestureTest.kt` 与 `PetGesture.kt` 可一起用 Kotlin/JVM 编译运行，验证九组手势边界。原生代码还需与真实 EasyFloat AAR / Android SDK 编译匹配，最终以 HBuilderX 自定义基座和手机验证为准。

小米 14 验收：授权前开启 → 授权返回 → 首次显示 → 连续开关 → 拖动后不误触 → 点击返回 → 长按松开展开动作菜单 → 旋转 → 撤销悬浮权限 → 恢复授权 → Home/锁屏/省电 → 清理进程再打开。检查状态文字、动画、无重复窗口和关闭后无残留。

当前使用 DS 鲸鱼娘完整 106 段视频动画，含「时节 → 舞狮头」，按原分类与权重播放。原精灵素材与配置备份在 `resources/mobile-pet/archive/elf-v3`；新素材来源和禁止商用的限制见 `resources/mobile-pet/dsh-source/README.md`。播放器采用 RGB/透明遮罩并排 MP4 + WebGL，保留原帧率；长按进入「分类 → 动作」。原生桥接升级为 API v2，需要重新原生构建；当前未发布或真机验证。
