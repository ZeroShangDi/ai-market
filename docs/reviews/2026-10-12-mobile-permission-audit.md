# 移动端权限与后台拨号核验

本轮为源码、官方接口文档及模拟原生适配器回归核验，尚未连接手机；不代表实机通过。

| 项目 | 检测与引导 | 结论与待验收 |
| --- | --- | --- |
| 扫码相机 | manifest CAMERA；checkSelfPermission；uni.scanCode；应用权限设置 | 声明及检查链路齐全。需实测首次允许、拒绝、永久拒绝、从设置返回刷新。 |
| 电话与通话记录 | CALL_PHONE、READ_PHONE_STATE、READ_CALL_LOG 逐项检查；全局首次申请 | 不按权限组推断。现已区分临时拒绝与永久拒绝；需实测通话记录受限授权及插件初始化。 |
| 麦克风 | RECORD_AUDIO 检查与全局申请 | 授权不等于系统允许电话录音。需验证撤销授权后状态更新。 |
| 自动录音 | 插件 checkCallAutoRecorder 的 data.isOpen；toCallAutoRecorderPage | 与旧项目接口一致。未知值不能当作已开启；厂商兼容及真实录音文件仍需实测。 |
| 录音文件访问 | Android 11+ isExternalStorageManager；旧版 READ_EXTERNAL_STORAGE | 增加 SDK 未知保护。特殊设置尝试启动，抛出异常时回退应用详情；不以 resolveActivity 空值阻断入口。权限通过不证明能读取真实录音目录，Android 10 分区存储、厂商路径仍需实测。 |
| 悬浮窗 | Settings.canDrawOverlays；MANAGE_OVERLAY_PERMISSION | 与运行时权限分开检测；增加设置入口可用性检查。授权不代表手机宠已经创建。 |
| 电池优化 | isIgnoringBatteryOptimizations；IGNORE_BATTERY_OPTIMIZATION_SETTINGS | UI 改称电池优化，避免冒充完整后台能力。厂商自启动、后台弹出页面需独立人工核对。 |
| 手机宠 | 独立开关、权限、原生 WindowManager 视图挂载状态 | 增加原生对象创建失败提示，等待窗口挂载，失败清理；已授权但显示失败时支持重试，而非重复跳权限。未确定本次实机失败根因。 |

## 后台拨号

当前后台轮询被 canRunInBackground 限制，依赖手机宠已开启、已显示且悬浮授权有效。手机宠失败会导致 onHide 停止轮询，这是明确的代码关联，但不能据此断定唯一实机根因。

当前没有原生前台服务、进程恢复或服务端推送唤醒链路。不能把 JavaScript 定时器或悬浮窗视为可靠后台常驻；不通过移除检查来声称后台问题已解决。

## 实机排查顺序

1. 查看实际包版本、Android 版本、厂商及最终 APK 权限声明。
2. 前台扫码配对并验证一次 PC 发起拨号，保存结果。
3. 逐项撤销/申请/永久拒绝相机、电话、通话记录、麦克风，核对 App 内状态与系统状态。
4. 开启所有文件访问、自动录音后完成一次真实通话，确认文件可查询读取。
5. 先授权悬浮窗，再开启手机宠；记录创建对象、addView、挂载及系统 WindowManager 日志，确认窗口真实可见。
6. 按 Home 后保持亮屏派发，检查服务器心跳、dispatch 拉取、领取及插件调用日志，定位断在接单还是系统拨号。
7. 再测试锁屏、电池优化、厂商后台弹出限制。划掉进程及重启另作能力边界测试，不承诺自动唤醒。

## 依据

- https://www.html5plus.org/doc/zh_cn/android.html （Native.js 调用可能静默返回空值，不能仅依赖 try/catch）
- https://developer.android.com/training/permissions/requesting
- https://developer.android.com/training/data-storage/manage-all-files
- https://developer.android.com/training/monitoring-device-state/doze-standby
- https://developer.android.com/guide/components/activities/secure-bal
- 旧项目 CallPhoneApp/pages/phone-main/talk-check.vue：录音与文件插件接口、厂商后台设置说明。


## 本次深度复查：已授权仍未知、桌宠未显示

本次检查基于当前 `apps/call-phone-uni` 源码、已安装依赖和 DCloud/Android 官方说明。没有连接实机，也没有取得用户手机上的 APK，因此下面区分源码确定的缺陷与待证实的设备原因。仓库当前 manifest 为 1.0.6 / 104；这不能证明手机安装的是该版本。

### 源码确认的阻断链

1. 原来 `permissionGranted`、`allFilesGranted`、`batteryUnrestricted`、`overlayPermission` 都依赖 `getAttribute('android.os.Build$VERSION', 'SDK_INT')`。该值为空或接口抛异常时，各项返回 null；桌宠的 `refreshMobilePet` 遇到 null 不会调用 `showOverlay`。因此一次版本读取失败可以解释多个权限同时未知并且桌宠不显示。**尚未证实用户手机正好发生这一故障**。
2. 原来基础权限申请只选择 `permissionGranted(...) === false`；null 被忽略，启动或重试无法申请这些权限。系统授权回调若不包含 granted/denied 字段，原来也会被当成成功。
3. 原生权限查询只接受 JS number/boolean，明确的字符串数字/布尔值也会成为未知。已增加有限的值兼容，绝不使用 `Boolean('false')` 或 `Number(null)` 推断授权。
4. 桌宠 UI 把已启用但未显示一律标成“待开启权限”。实际还可能是 SDK 查询失败、UI 回调超时、图片解码失败、窗口未挂载。现在按权限与显示分别提示，并保留具体错误。
5. 设置入口之前以 `resolveActivity` 非空作为启动条件。Android 包可见性会影响此类查询，不能把空值直接认定为入口不存在。本次普通应用权限优先使用 `uni.openAppAuthorizeSetting`，特殊权限尝试启动 Intent，抛错时回退应用设置。Native.js 的 void 调用可能静默失败，因此也不能把 startActivity 返回 undefined 当作失败或成功证据。

### 桌宠原实现的结构性问题（迁移结果见文末）

审计时旧链路：App.onShow → refreshMobilePet → overlayPermission → showOverlay → runOnUiThread → LinearLayout/ImageView/TextView/AnimationDrawable → WindowManager.addView → isAttachedToWindow。

DCloud 的 Native.js 文档明确说明 uni-app 不支持 UI 相关 API 调用。旧桌宠通过 Native.js 创建、修改 Android 原生 View，属于该限制范围；增加 runOnUiThread 并不会让它成为受支持的实现。源码级 mock 能证明 JS 分支，不能证明原生 UI 可用。这是高优先级兼容性问题，不能将它归因为用户没有开启权限。

长期实现应将悬浮窗、动画、触摸监听、挂载状态和释放迁到本地 UTS Android 插件或原生 Android 插件，向现有 mobile-pet 模块返回明确结果。若要求 Home/锁屏后持续运行，还需单独设计原生 Service 和生命周期；添加 FOREGROUND_SERVICE 声明本身不会创建服务。后续已接入 EasyFloat UTS/Kotlin 插件，见文末；原生 Service 仍未实现。

### uni 可配置能力与引导范围

| 层次 | 官方能力 | 本项目如何使用/应如何引导 |
| --- | --- | --- |
| APK 权限声明 | manifest.json → app-plus.distribute.android.permissions；custompermissions；必要时 nativeResources/android/AndroidManifest.xml | 当前十项声明覆盖悬浮窗、所有文件、网络、安装、相机、拨号、电话状态、通话记录、麦克风、旧存储读取。源码声明不等于最终 APK 已合并声明，也不等于用户已授权。 |
| Android 版本/模块 | minSdkVersion、targetSdkVersion、modules、nativePlugins | 当前配置未显式指定 min/target SDK，要检查最终 APK，不能按源码空缺推断版本。Barcode/Invocation 与 leven-call 已配置；标准基座不等于包含该云插件的自定义基座或正式 APK。 |
| 启动权限策略 | permissionExternalStorage、permissionPhoneState 的 request/prompt | 用于引擎的特定启动申请策略，不能代替全体权限查询，也不能开启悬浮窗、自动录音、所有文件或自启动。当前项目未配置这两项。 |
| 普通权限状态 | uni.getAppAuthorizeSetting（App 3.5.2+） | 相机、麦克风可兜底；电话、通话记录、所有文件、悬浮窗、电池优化没有对应字段，仍需 Android/插件检测。Android 的 camera/microphone config error 也可能表示未获授权，不能一概解释成 manifest 漏配。 |
| 普通权限申请 | plus.android.requestPermissions；UTS 内可用 UTSAndroid.checkSystemPermissionGranted/requestSystemPermission | 本项目仍复用 plus；检查 granted/deniedPresent/deniedAlways，申请后重新查询。永久拒绝引导应用设置。UTSAndroid 可用于普通 uni-app 的 Android UTS 插件，并非要求整项目改成 uni-app x。 |
| 普通权限设置 | uni.openAppAuthorizeSetting（App 3.5.3+） | 本次作为“系统应用权限”的首选入口，失败回退 Android 应用详情；返回时由 App/页面 onShow 复查，打开成功不能直接写 ready。 |
| 申请原因提示 | uni.createRequestPermissionListener（Android HBuilderX 4.0+）；uni-registerRequestPermissionTips | 可监听申请/系统弹窗/完成；前端弹窗层级低，申请时覆盖系统授权框需官方原生提示插件。本次增加手动申请基础权限及用途说明，未安装新的提示插件。 |
| 悬浮窗 | SYSTEM_ALERT_WINDOW；Settings.canDrawOverlays；ACTION_MANAGE_OVERLAY_PERMISSION | 单独特殊访问，不走 requestPermissions。Android 11 起 package URI 可能被忽略、进入授权列表，需要提示用户找到当前应用。桌宠开关独立于系统授权。 |
| 录音文件访问 | Android 11+ MANAGE_EXTERNAL_STORAGE / Environment.isExternalStorageManager / ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION | 特殊访问设置，不应混入普通申请；旧版 READ_EXTERNAL_STORAGE 不等于新系统全文件访问。即便全文件获批，Android 仍限制访问其他应用的 Android/data 目录。不能保证厂商电话录音目录可读。 |
| 电池优化 | PowerManager.isIgnoringBatteryOptimizations；IGNORE_BATTERY_OPTIMIZATION_SETTINGS | 查询的是优化豁免；不是自启动、后台弹出页面、锁屏拨号或常驻资格。本项目没有请求直接豁免的 REQUEST_IGNORE_BATTERY_OPTIMIZATIONS，进入通用优化设置无需为了此入口追加该声明。 |
| 系统电话自动录音 | 当前 leven-call 的 checkCallAutoRecorder/toCallAutoRecorderPage | 不是 Android 通用运行时权限；取决于设备电话应用。麦克风授权不能保证系统录音已开启，也不能保证第三方能读取通话音频。 |

### 本次已落地的修改

- device-readiness/android.ts 集中处理 SDK 与普通/特殊权限检测；后续桌宠迁移后，悬浮权限改用原生 Settings.canDrawOverlays 查询，独立于业务权限模块。
- SDK 静态属性读取失败时尝试导入类；普通权限不再等待 SDK 成功，可回退 checkCallingOrSelfPermission，相机/麦克风增加 uni 接口兜底。
- 空值保留未知；已知返回值规范化；检查失败按项记录诊断，避免只有一个无来源的问号。
- 未知的基础权限可申请，未知 SDK 不再误走旧存储权限分支；授权回调内容不完整则报告失败。
- 增加“申请基础权限”按钮和用途说明；设置返回继续复查；桌宠已授权但显示失败时提示重试显示。
- 保留桌宠显示门槛与真实挂载检查；没有将授权成功冒充窗口显示成功。

权限修复阶段验证：60 项自动化回归、类型检查与 App 资源构建通过。后续 EasyFloat 迁移验证见文末；没有签发新 APK、云端打包或升级手机，实机验证仍未完成。

### 针对这台手机的下一步验证

1. 确认品牌/型号、Android 版本、安装 APK 或基座类型、手机显示的应用版本和包名。基座中的权限属于基座包，不应到正式包权限页面核对。
2. 用本次代码重新构建运行，查看“拨号与录音/辅助功能”的具体诊断。若版本读取仍失败，收集 permission-probe 日志；若普通电话状态仍未知，则核对 Native.js 引擎、Activity 与插件是否可用。
3. 如果悬浮窗显示已允许，而桌宠报告超时/窗口未挂载，记录具体阶段和原生日志，此时检查插件是否装入、素材路径与挂载回调，不再让用户反复授权。
4. 检查最终 APK 的 uses-permission、target SDK、包名及插件合并结果；真机至少验收首次拒绝、永久拒绝、设置授权后返回、撤销权限后刷新、桌宠创建与关闭。

### 补充官方依据

- [Native.js 能力限制](https://zh.uniapp.dcloud.io/tutorial/native-js.html)
- [App Android manifest 配置](https://uniapp.dcloud.io/collocation/manifest-app.html)
- [Android 权限配置及打包](https://uniapp.dcloud.io/tutorial/app-permission-android)
- [uni.getAppAuthorizeSetting](https://uniapp.dcloud.io/api/system/getappauthorizesetting.html)
- [uni.openAppAuthorizeSetting](https://uniapp.dcloud.net.cn/api/system/openappauthorizesetting.html)
- [uni 权限申请监听](https://uniapp.dcloud.net.cn/api/system/create-request-permission-listener)
- [UTSAndroid](https://doc.dcloud.net.cn/uni-app-x/uts/utsandroid.html)
- [Android 11 权限变化](https://developer.android.com/about/versions/11/privacy/permissions)
- [Android 全文件访问范围](https://developer.android.com/training/data-storage/manage-all-files)

- [Android 包可见性与启动其他应用](https://developer.android.com/training/package-visibility/use-cases)


## 用户补充实机环境后的判断

用户确认：小米 14、版本文字“13.0.9”、HBuilderX 标准基座；相机、电话与通话记录、麦克风、录音文件、悬浮窗、电池优化均未知。版本文字不足以确认 Android API 等级，可能来自不同版本字段，不能据此硬编码 SDK。

六项同时未知进一步支持共用桥接/SDK 读取异常的排查方向，但仍不能把该假设写成已在设备复现。补充记录原生环境未就绪、非 Android、plus.android 缺失和环境读取异常，避免 bridge 返回空值时整个界面没有诊断。

标准基座只更新可热刷的 JS/资源；项目权限、包名、原生模块、第三方 SDK 变更需重新打包才能进入原生包。项目配置的 leven-call 为第三方云端原生插件，需制作包含插件的自定义基座或正式 APK 验证，标准基座不能用来验收该通话插件。**缺失通话插件本身不解释相机、麦克风、悬浮窗、电池优化全部未知**，这些查询使用独立的 Android 桥接，应继续查看补充后的检测诊断。

操作顺序：运行最新修复代码并在“我的”重新检查 → 核对系统授权对象是否确实为当前运行的基座应用 → 使用 manifest 的 __UNI__D608100 / uni.UNID608100 和 leven-call 制作自定义调试基座 → 在运行到手机菜单明确选自定义基座重新运行 → 设置该包的普通权限及悬浮窗/所有文件访问 → 核对权限状态和通话插件，再单独验证桌宠原生窗口。标准基座切换到自定义基座可能更换包名，旧应用授权不能假设自动迁移。

自定义基座需包含后续新增的桌宠 UTS 插件，不能保证小米后台或锁屏持续运行。小米自启动和后台弹出页面属于后续后台能力验收，当前前台六项未知应优先定位查询链路。

## 后续落实：EasyFloat 接入（2026-10-12）

已将旧 Native.js UI 替换为 `uni_modules/portable-pet-overlay` 内的 UTS/Kotlin 原生实现，固定 EasyFloat 2.0.4（Apache-2.0）。桌宠控制器独立于 Vue/uni 与业务，通话/连接文字映射移到宿主 `services/pet-status.ts`。迁移与构建说明位于 `apps/call-phone-uni/src/modules/mobile-pet/README.md`。

窗口创建后检查实际挂载，关闭后检查实际卸载；处理创建/桥接超时、权限撤销、连续开关、过期回调、Activity 销毁、低内存、拖动误触与多指取消。原生层无账号、电话或网络依赖，没有加入后台 Service。

验证：58 项宿主/权限回归与 12 项桌宠状态机/桥接回归通过，vue-tsc 通过，App 和 H5 资源构建通过；App 产物包含 UTS 生成 Kotlin 和两个原生 Kotlin 源文件。使用 Kotlin 2.2.0、Android API 35 与真实 EasyFloat 2.0.4 AAR 单独编译原生层通过；9 组手势 JVM 边界用例通过。这不等于完整 APK 原生打包成功，也没有完成小米 14 实机显示/锁屏验证。

需要用包含桌宠 UTS 插件与原有 leven-call 的自定义基座重新安装、运行和授权。WGT 不能给未包含该插件的旧基座增加原生能力。
