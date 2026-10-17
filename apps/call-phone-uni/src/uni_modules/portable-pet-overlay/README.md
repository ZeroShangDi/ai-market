# portable-pet-overlay

独立 Android UTS/Kotlin 桌宠窗口插件，EasyFloat 2.0.4，Android 23+。复制整个目录到另一 uni-app 的 `src/uni_modules` 即可复用原生层；需原生编译、悬浮窗用户授权、可用前台 Activity。EasyFloat 许可证随目录保留在 LICENSE-EasyFloat。

## API v2

Android `getApiVersion()` 返回 2，宿主桥接要求 v2；旧安装包/自定义基座须重新原生编译。未支持平台返回 0。权限、状态、文本、显示/关闭和事件订阅接口保持原语义。

视频显示参数：`{version:1,renderer:"rgb-alpha-sbs-v1",playerPath,playerAssetPath,sizeDp,text,actions}`。actions 为 `[{id,label,group,videoPath,assetPath,repeats,randomWeight}]`，第一个为 idle/repeats=0；其余 repeats 为 1–6。id 为 1–24 位英文标识，label 最长 40 字符，group 最长 20 字符。最多 128 个动作。路径仅允许宿主可信本地文件或 APK assets，不接受远程 URL/路径穿越。

`PetVideoView.kt` 使用本地 WebView + WebGL，视频采用 RGB/灰度 alpha 左右并排的标准 H.264 MP4。原帧率、时长、完整画面保留，只添加透明上下边统一方形画布。页面仅允许虚拟本地源 `https://pet.invalid`，所有请求由原生拦截并返回本地数据，支持 Range，不访问网络。桥接只接收播放状态，不暴露业务能力。

EasyFloat 默认窗口未开启硬件加速，`VideoOverlayContext` 仅包装该窗口的 WindowManager，在首次 addView 前设置硬件加速。只有窗口已挂载且视频首帧已绘制后才报告 show 成功。初次挂载/绘制失败、视频播放失败明确返回错误，运行中失败关闭窗口并通知宿主。关闭先移出播放器再销毁 WebView，旧窗口/切换请求的异步事件被忽略。

自动动画按上游分类权重接续，事件专用动作不进入随机池。手动点播完成回到待机，再恢复自动播放。触摸由原生容器统一接收并控制拖动、靠边停靠与点击返回 App；长按 650ms 直接展开菜单，松手不会触发关闭；菜单改为「分类 → 动作」，带返回分类、滚动与收起，打开时禁用拖动，提供「打个招呼」短暂气泡入口。

## 素材与验证

当前完整接入 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 的 106 段动画，包含「时节 → 舞狮头」。动作名称、分类、随机权重沿用原配置。移动类动作目前播放动画，不自动移动窗口；点击回应、工作状态、余额、碎碎念等事件动画可手动点播，未复制 DSH 的业务逻辑。

原精灵与先前 PNG 方案分别保存在仓库 `resources/mobile-pet/archive/elf-v3`、`archive/dsh-png`，不参与客户端打包。源 WebM、版本与授权记录在 `resources/mobile-pet/dsh-source`，手机只打包 MP4、播放器和署名。素材明确禁止商用，用户已确认仅本地自用；分发前改用自有素材或取得授权。

浏览器真实视频解码、透明合成、结束事件、快速切换与释放可通过 `scripts/verify-pet-video.cjs` 验证。原生代码通过独立 Kotlin 编译检查，不能代替完整 UTS/APK 编译或真机验收。Android 上的透明窗口、Home 后播放、长按/拖动、菜单与旋转仍需真机确认。

原序列帧协议仍作为兼容能力保留：`{version:1,imagePath,assetPath,columns,rows,frames,sizeDp,text,sheets,actions}`。最多 32 张图集/32 个动作、每动作 256 帧、图片最多 8388608 像素。未用于当前 DS 动作播放。

## 2026-10-17 显示与触摸修复（1.0.18，真机待验证）

视频原文件保持不变。每段完整动画的 alpha 范围由 `scripts/measure-dsh-video-bounds.py` 统计到 `bounds.json`，动作目录的 bounds 为 640px 方形画布中的 `[left,top,width,height]`。WebGL 只显示该区域；原生以待机角色高度 104dp 确定统一源像素缩放，其他动作按相同比例调整窗口，并补偿裁切原点，避免切换时因道具大小缩放整个角色。待机从 640×640 收紧至 258×290。

去除常驻 caption/progress 行。`text` 命令展示白色圆角、小尾巴气泡，最多 80 字符，6.5 秒后隐藏；空文本立即隐藏。气泡出现/收起时调整窗口并保持角色锚点，普通连接轮询不再发送文字。语音能力未实现。

EasyFloat 内置拖动设为 false，原生根容器对收起状态下的触摸序列统一持有，避免 WebView 抢事件与 ParentFrameLayout 重复回调；超过系统滑动阈值才移动窗口，多指/取消不触发菜单。菜单在长按阈值到达时打开，原手指的 UP 仍由根容器消费，不会点击穿透。手势 JVM 测试覆盖按住展开与松手不重复触发；真实设备效果仍需验证。
