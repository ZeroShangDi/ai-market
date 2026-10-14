# 通用资源解析

`configureAssets({ baseUrl, manifest })` 初始化一次；`resolveAsset(name, { variant, fallback })` 按名称返回固定域名地址。`manifest` 为 tools/assets CLI export 的公开清单，不含供应商配置/上传凭据。

```ts
import { configureAssets, resolveAsset } from '@/modules/assets'
import manifest from './asset-manifest.json'
configureAssets({ baseUrl: 'https://assets.example.com', manifest })
const cover = resolveAsset('mobile.workbench.cover', {
  variant: 'webp', fallback: '/static/images/cover-placeholder.png'
})
```

```vue
<AppAsset name="mobile.workbench.cover" variant="webp"
  fallback="/static/images/cover-placeholder.png" mode="aspectFill" />
```

AppAsset 复用 uni 的 image，不做额外下载。配置缺失、名称缺失或路径非法时返回本地回退；加载失败也显示本地回退，不制造云地址。初始化须在组件挂载前完成。baseUrl 改动应在应用启动时统一加载，运行期响应式切换暂不提供。

当前已接入工作台和应用广场的可选应用图标：apps.ai-assistant.icon 与 apps.dialer.icon。初始 manifest.json 为空，页面通过 fallback 插槽使用本地 AppIcon。CLI export 可覆盖该公开清单；App.vue 在启动时加载清单与 VITE_ASSET_BASE_URL，更新后重新构建生效。

组件支持 fallback 字符串地址和 fallback 插槽，远程加载失败时也回退。组件不保证离线缓存；完整断网只能依赖真实存在的随包回退。核心图标继续由 icons 模块离线提供。
