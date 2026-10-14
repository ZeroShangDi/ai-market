# 共享离线图标能力

这里是通用资源目录，与拨号、AI 对话等业务无关。PC 既有 `Icon` / Iconify 入口保持兼容；新增 uni `AppIcon` 适配，不把 `@iconify/vue` 强行用于 uni。

## 来源与产物

- `registry.json`：全项目的语义名称、默认颜色、配色策略、资源来源与标签。
- `catalogs/ri.json`：Iconify 格式的 Remix Icon 4.8.0 构建图库，3,229 个图标及别名；仅供构建，不进入移动端包。
- `licenses/Remix-4.8.0-Apache-2.0.txt`：该版本的许可文本。微信等品牌图标同时应遵守品牌使用规范。
- `custom/`：额外 SVG / PNG 原图，统一登记到注册表。
- `apps/call-phone-uni/src/modules/icons/generated.ts`：只包含注册/扫描到的资源，已提交，初次构建无需联网。
- `apps/call-phone-uni/src/components/AppIcon.vue`：uni 渲染适配。

图库取得于 2026-10-14：[Iconify 数据仓库](https://github.com/iconify/icon-sets/blob/master/json/ri.json)，版本来源为 [Remix 4.8.0 分支](https://github.com/cyberalien/RemixIcon)。来源锁定在本地快照；更新图库时同时复核版本和许可，不能把上游当前版本的许可自动套用到其他版本。

## 使用

业务页面导入一个 `AppIcon` 组件，不逐个导入资源：

```vue
<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
</script>
<template>
  <AppIcon name="search" :size="24" color="#2878FF" />
  <AppIcon name="wechat" :size="20" />
</template>
```

普通图标使用明确的 `color` 或注册表默认颜色；独立 SVG 图片无法继承页面 CSS 的 `currentColor` / `var()`，所以传入具体颜色。`original` 配色始终保留原色，微信使用 `#07C160`，页面颜色不会将它变成黑白。未知名称或图片加载失败回退到 `unknown`。尺寸以 px 为单位，默认 24。装饰图标默认对读屏隐藏；作为独立信息时传 `label`，作为按钮内部图标时在外部按钮提供标签。

## 构建与扩展

项目根目录执行：

```sh
node resources/icons/build.mjs
cd apps/call-phone-uni
node --test tests/icons.test.cjs
```

构建自动扫描 uni `.vue` 中的静态 `AppIcon name`，常规图标可直接写 `name="ri:star-line"`，下一次生成自动从默认图库提取，无需逐个 import 或下载。更推荐业务语义名称：在 `registry.json` 添加 `favorite: { "source": "ri:star-line" }`，以便未来换图形不改页面。

**动态名称**（例如 `:name="tab.icon"`）必须提前登记在 `registry.json`。注册表内资源全部打包，这是明确的动态保留清单；扫描遇到拼错的静态语义名会停止构建，避免静默遗漏。运行时不会请求公共 Iconify API。

新增外部图库：将相应 Iconify JSON 放入 `catalogs/<prefix>.json`，保留版本和许可，注册 `source: "<prefix>:<icon>"`。目前支持无变换别名；旋转/镜像别名会明确报错，需要改为源图标或静态 SVG。PC 已声明 `@iconify/json`，安装后也可从该包复制 JSON 到这里；构建不依赖整个全图标包。

新增定制资源：把原图放在 `custom/`，按下面登记并生成：

```json
{
  "brand-logo": { "file": "custom/brand-logo.svg", "colorMode": "original", "label": "品牌" },
  "app-cover": { "file": "custom/app-cover.png", "colorMode": "original", "label": "应用" }
}
```

SVG 可以有多种固定颜色。需要随主题变色的 SVG 采用 `fill="currentColor"` 和 `colorMode: "theme"`。PNG 始终保留颜色，生成时复制进 uni 静态目录。自定义 SVG 必须为独立静态图形，不支持脚本、样式表或外部引用。

本地图形允许 url(#id) 引用自身定义的渐变，外部 paint URL 仍被拒绝。app-phone 使用完整原拨号 APP 图标；app-ai 为新 AI 对话图标；brand-assistant 为统子哥品牌图标，三个均保留原色。

## 跨端边界

- 当前适配目标：H5 与 uni APP 的 WebView 页面，通过 `<image>` 使用离线 SVG data URI；核心图标不依赖后端或网络。
- PNG 扩展使用 uni 的静态图片路径。小程序、nvue 与原生渲染器的 SVG 支持不同，目前不宣称支持这些平台；若启用应增加 PNG / 字体产物适配，并做对应设备验证。
- `registry.json` 与 Iconify 格式图库可供 PC、未来其他客户端复用。PC 现有 Iconify 组件未作大范围迁移；后续可复用此注册表向 `addIcon` 登记本地数据。
- 当前检查包括颜色、回退、扫描、遗漏、离线产物和自定义资源。H5 编译与真机 SVG 显示由页面接入阶段验证。

该目录是准备好的基础能力；页面接入、PC 全量迁移、图库预览管理界面均不属于能力本身。
