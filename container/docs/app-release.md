# 应用版本管理与独立更新

版本管理位于「运维中心 → 应用版本」。它管理发布元数据和安装包分发，不依赖业务登录，不导入客户、通话或配对。手机继续使用原更新组件；此轮没有重新打包或安装手机 App。

## 发布流程

1. 在管理页登记应用标识、Android 包名、清单公钥和 HTTPS 下载根地址。应用标识须与客户端内置配置一致。已有发布历史后不能直接换公钥或下载根地址。
2. 选择 ABI 与渠道，上传已经由原构建流程签名的 APK，填写实际 versionCode、versionName 和简短更新摘要。服务端流式计算 SHA-256，保存为不可变的「版本号-哈希.apk」，下载待签名模板。
3. 在可信构建机离线验包、签清单。服务器、PC 和客户端不内置清单签名私钥：

```sh
node container/scripts/sign-release.mjs unsigned.json /secure/release-private.pem signed.json \
  --apk /release/application.apk --certificate-sha256 EXPECTED_APK_CERTIFICATE_SHA256
```

构建机安装 Android SDK 的 aapt2/apksigner，或设置 `AAPT2`、`APKSIGNER_JAR`、`JAVA_BIN`；macOS 可复用 HBuilderX 内工具。也支持 `--aapt` 和 `--apksigner`。加密 PEM 私钥通过安全注入的 `CONTAINER_RELEASE_KEY_PASSPHRASE` 解锁，不把口令写进命令参数。工具验证 APK 签名及预期证书、包名、版本、单一 ABI、字节数和哈希，错误即停止。

4. 导入签名 JSON，只产生草稿。管理员确认发布后，事务内更新当前发布，并再次核对本地不可变安装包。客户端不接受草稿。
5. 清单过期前，用管理页「续期模板」为同一安装包签署更高序号；无需虚增 App 版本。撤回也要导入更高序号的签名清单，其中 `release:null`；不能用无签名空响应撤回。

APK 应先通过原发布流程的真机验证；此管理页不是 APK 构建器。服务端不执行上传包，也不自动执行 Android 工具；可信构建机负责验包。安装前原生更新组件继续核对包、版本、哈希及签名证书。

## 元数据及兼容

外层保持 `{payload, signature}`，对原始 UTF-8 payload 使用 RSA-SHA256。v2 payload 包括 `schemaVersion:2`、递增 `sequence`、`issuedAt/expiresAt`、绑定 appId/packageName/platform/architecture/channel 的 `target`，以及更新对象或 null。最长有效期 30 天；服务器时间和设备时间需要正确。

客户端验证签名、目标、有效期和包信息后，保存目标独立的最高序号、签名及历史最高版本。拒绝旧序号、同序号换内容和版本降级。撤回不清空最高版本水位。更新元数据保存失败或损坏时停止此次更新检查，业务仍可用。应用数据被清除后本地历史水位会重置；过期时间仍限制旧元数据使用，不能声称能抵御已控制设备的攻击者。

只登记应用或导入草稿时保留原文件清单；该目标首次正式托管发布后改为读取数据库当前发布。签名撤回和已托管清单过期（HTTP 410）都不回退旧文件。旧客户端继续按原协议处理原发布源；新版 v2 客户端只接受 v2。切换真实旧客户端前，应通过原发布流程先交付支持 v2 的客户端版本，不能直接替换其清单协议。

公开路由保持 `/api/v1/app-updates/{package}/android/{abi}/{channel}/manifest.json` 和 `/{package}/apk/{versionCode}-{sha256}.apk`，支持 HEAD/Range。托管清单 no-store，安装包 immutable。注册公钥不是客户端首次信任来源；客户端仍需内置可信公钥，不能从同一个未经验证的更新接口下载公钥后自称安全。

## 四种身份不要混用

| 标识或密钥 | 用途 |
|---|---|
| 更新 appId、Android packageName | 绑定客户端和安装包 |
| OAuth clientId | 应用登录与公共 API 授权 |
| 支付 appKey | 独立支付渠道与记录归属 |
| APK 签名证书 | Android 安装及更新身份 |
| 清单 RSA 密钥 | 验证发布者的更新元数据 |
| TLS/mTLS 证书 | 加密传输及服务间应用身份 |

## 已验证与限制

接口 10 项、真实管理页 5 项、既有真实 APK 的离线验包签清单 3 项通过。移动测试包含真实 RSA 验签、目标不符、过期、回滚、同序号换内容、撤回和存储失败。上传/下载测试使用明确不可安装的传输字节；另外只读检查了已有 APK，没有重新生成、发布或安装 APK。

当前自有分发覆盖 Android 单 ABI APK；PC 是 Web 前端，不冒充桌面安装器；未实现 iOS 或应用商店自动发布。密钥轮换、多签阈值、独立 root/timestamp/snapshot 角色没有实现，因此不是完整 TUF 实现。已有公钥迁移与真实应用发布需要单独安排。

Android 将 versionCode 用于版本顺序，versionName 用于展示，安装包必须具有有效签名。参考 [Android 版本规则](https://developer.android.com/studio/publish/versioning)、[Android 应用签名](https://developer.android.com/studio/publish/app-signing)。元数据有效期与防回滚借鉴 [TUF 规范](https://theupdateframework.github.io/specification/latest/) 的原则，此处保留现有协议的有限扩展，未宣称 TUF 合规。
