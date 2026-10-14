# HBuilderX 云打包图标

HBuilderX 以 CLI 项目根目录解析 manifest 的 static/app-icons 路径，此目录供云打包配置校验及上传使用。src/static/app-icons 中同名文件供 uni-app 编译并复制到 App 资源目录。

修改图标时需同步两处同名 PNG；原始素材保存在 src/static/app-icons/source.png。

Android 还在 nativeResources/android/res/drawable/icon.png 保留 48×48 默认资源，用于安装前图标预览兼容；resources/branding/build-icons.cjs 会同步生成该文件。AndroidManifest.xml 为启动 Activity 显式声明同一图标，manifest.json 配齐 mdpi 至 xxxhdpi。
