# 全局设备准备检查

App.onShow 调用 onApplicationShow。每次进程首次进入前台申请未授权或无法确认的基础电话/通话记录、相机、麦克风权限；旧 Android 同时申请读取存储。后续从设置返回只复核，不循环弹出授权请求。被永久拒绝的权限通过“我的 → 拨号与录音 → 去授权”手动开启。

电话监听在权限就绪后全局注册，客户页面不再负责首次初始化。Android 11+ 使用 Environment.isExternalStorageManager 检测录音文件访问，之前版本检查 READ_EXTERNAL_STORAGE。自动录音由现有 leven-call 插件读取；缺失字段、失败、超时或不支持显示“无法确认”，不以真值转换伪造成功。

“已就绪/需设置/无法确认/检查中”分别显示图标和文字，不仅用颜色。检查不能证明系统确实生成了可上传录音，仍需一通真实电话验证。


普通权限查询不再依赖 Android SDK 读取成功，相机/麦克风可用 uni.getAppAuthorizeSetting 兜底。SDK 未知时不推断旧版存储权限，特殊访问仍保留未知。Native.js 明确返回值规范化，检查失败提供按项诊断。手动“申请基础权限”可重试；系统应用权限设置优先使用 uni.openAppAuthorizeSetting，打开与返回不等于已授权。
