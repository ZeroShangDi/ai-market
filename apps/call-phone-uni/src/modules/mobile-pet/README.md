# 手机宠（Android 试验模块）

所有悬浮窗创建、权限入口、拖动/点击/长按、状态显示、偏好持久化与生命周期位于本目录。外部只通过 index.ts 引用；模块不依赖账号、拨号或服务器代码。

- App onShow 调用 refreshMobilePet()，检查权限并恢复用户开关。
- setMobilePetEnabled(boolean) 控制开关；首次开通仍由用户在 Android 系统设置授权。
- onPetChange / canRunInBackground 给业务层提供实际悬浮窗口是否可用的信号。
- reportPetConnection(connected, busy) 输入当前业务连接状态，不传手机号、客户或凭据。
- Native.js 创建 TYPE_APPLICATION_OVERLAY（Android 8+）或 TYPE_PHONE（旧版）。68dp 小型角色显示眼睛与状态，拖动位置限制在屏幕内；点击返回 App，长按关闭。
- SYSTEM_ALERT_WINDOW 需要在宿主 manifest 中声明。H5/iOS 显示不支持，不做页面浮层假冒系统悬浮窗。

## 边界

这是复用现有 JS 派发轮询的后台试验，不是独立常驻服务。悬浮窗不承诺保持 JS 运行，也不能让被杀进程或被强制停止的 App 自动复活。系统深度休眠、锁屏、厂商省电/自启动/后台弹出界面限制仍可能中断接单。没有申请唤醒锁、无障碍或隐藏服务；没有宣称已实现开机自启。

若后续需要确定性更高的后台接单，应把网络接收及生命周期下沉到有常驻通知的原生服务/合规推送通道，按目标 Android 版本配置服务类型，继续通过本模块公开接口展示状态。

## 真机验收

首次启用 → 系统授权 → 返回后显示；拖动不拨号，点击返回、长按关闭；撤销权限后停止后台轮询。分别测试 Home、锁屏、省电、杀进程、离线恢复。后台拨号仍复用单通话锁与幂等派发；结果未保存时不得接下一个电话。真实系统悬浮窗和锁屏拨号尚未在设备验证。

## 精灵少女形象（2026-10-12）

素材与动画全部保留在本模块。assets/elf-sheet-v2.png 是透明三帧长腿版；appearance.ts 定义待机、眨眼、挥手的播放节奏，Android 使用 AnimationDrawable 播放，不依赖 JavaScript 定时器推进图像。assets/elf-animated.png 是相同节奏的透明 APNG 预览（不是静态 PNG）。初版 elf-sheet.png 保留用于对比。

内置 imagegen 生成素材，随后仅将三帧编排为 APNG。提示词：原创自然系精灵少女，银薄荷长发、绿眼、尖耳、叶冠、白绿叶片服装、透明绿色小翅，等宽三格待机/闭眼/挥手；第二版保持角色一致并将腿部拉长约 25%，透明背景无文字。具体长度是生成目标，不是精确测量保证。

uni-app 将图片打包为 /assets/... URL。原生优先 decodeFile 读取 _www 映射，云打包资源再通过 AssetManager 读取 apps/<appid>/www/assets/...；不依赖 ?inline（实测 App 编译未内嵌）。图片解码及最终显示仍待真机验收。

## 公开项目对照

对照 https://github.com/faysal-X-N/deskpet/blob/main/app/src/main/java/com/deskpet/overlay/PetOverlayService.kt ：该项目使用原生前台 Service、TYPE_APPLICATION_OVERLAY、NOT_FOCUSABLE、NOT_TOUCH_MODAL、TRANSLUCENT 以及 WindowManager.addView。我们的窗口类型和透明格式一致；其额外 LAYOUT_NO_LIMITS 允许出屏，并非显示所必需。主要差距是本项目还没有原生前台 Service。该差距可影响后台生存期，但不能据此断定首次手机宠不显示的根因。不复制第三方代码或素材。
