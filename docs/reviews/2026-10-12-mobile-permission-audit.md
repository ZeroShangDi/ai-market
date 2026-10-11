# 移动端权限与后台拨号核验

本轮为源码、官方接口文档及模拟原生适配器回归核验，尚未连接手机；不代表实机通过。

| 项目 | 检测与引导 | 结论与待验收 |
| --- | --- | --- |
| 扫码相机 | manifest CAMERA；checkSelfPermission；uni.scanCode；应用权限设置 | 声明及检查链路齐全。需实测首次允许、拒绝、永久拒绝、从设置返回刷新。 |
| 电话与通话记录 | CALL_PHONE、READ_PHONE_STATE、READ_CALL_LOG 逐项检查；全局首次申请 | 不按权限组推断。现已区分临时拒绝与永久拒绝；需实测通话记录受限授权及插件初始化。 |
| 麦克风 | RECORD_AUDIO 检查与全局申请 | 授权不等于系统允许电话录音。需验证撤销授权后状态更新。 |
| 自动录音 | 插件 checkCallAutoRecorder 的 data.isOpen；toCallAutoRecorderPage | 与旧项目接口一致。未知值不能当作已开启；厂商兼容及真实录音文件仍需实测。 |
| 录音文件访问 | Android 11+ isExternalStorageManager；旧版 READ_EXTERNAL_STORAGE | 增加 SDK 未知保护。特殊设置先检查可解析性，不可用回退应用详情。权限通过不证明能读取真实录音目录，Android 10 分区存储、厂商路径仍需实测。 |
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
