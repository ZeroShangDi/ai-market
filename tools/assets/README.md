# 统一公开图片资源库

这是独立于业务页面的通用能力。命令和程序共享同一份登记清单；支持本地、现有后端文件上传以及 R2/S3。当前没有开通云服务、配置账号或向外部上传真实资源。

## 原图与链接

- `library/catalog.json`：资源 ID、名称、分类、版本、原图/派生图哈希、尺寸（可识别时）、状态、供应商位置。
- `library/objects/assets/<ID>/<版本内容SHA256>/original.<格式>`：保留原始字节。不会删除源文件，不会覆盖旧版本。
- 派生图使用同版本下独立文件名（`webp`、`thumb` 等），整个版本由原图与派生图的哈希共同确定。
- 外部地址由唯一配置 `publicBaseUrl + object.key` 生成。名称引用与供应商无关。重复上传同名同内容只登记一次。
- 新内容创建新版本；相同原图但派生图变化也创建新版本。查询默认返回当前成功版本；历史及失败详情可从完整清单查看。
- 写入使用进程锁和原子替换。上传前先归档和登记 `pending`；失败登记为 `failed`，不对外导出新链接，也不替换原先成功版本。相同输入可重试。
- 本地备份、清单必须一起持久保存；`.asset-library/` 默认不提交 Git。该能力仅用于公开 UI 图片，不提供业务附件鉴权。

## 配置与命令

需要 Node >= 22.13。复制 `config.example.json` 为 `asset-config.json`，`library` 相对配置文件所在目录解析。不得把凭据写入配置、代码或公开资源清单。

```bash
cp tools/assets/config.example.json tools/assets/asset-config.json
node tools/assets/cli.mjs upload ./cover.png --name mobile.workbench.cover --config tools/assets/asset-config.json
node tools/assets/cli.mjs query mobile.workbench.cover --config tools/assets/asset-config.json
node tools/assets/cli.mjs export --out ./asset-manifest.json --config tools/assets/asset-config.json
node --test tools/assets/test.mjs
```

本地适配只归档文件；示例地址 `http://127.0.0.1:8788` **不是公网链接，也不会自动启动图片服务**。可以将 `library/objects/` 部署到已有静态文件服务，并把 `publicBaseUrl` 配为该服务地址。切换 CDN 要先配置域名、回源与对象访问权限，改配置本身不会建立 CDN。

批量 JSON：路径相对该 JSON 文件，逐项导入，第一项失败即停止，之前成功项保留且重跑去重。

```json
[
  { "name": "mobile.workbench.cover", "file": "./cover.png", "category": "ui", "webpWidth": 720 },
  { "name": "mobile.banner", "file": "./banner.png", "derived": { "thumb": "./banner-thumb.webp" } }
]
```

```bash
node tools/assets/cli.mjs import ./batch.json --config tools/assets/asset-config.json
node tools/assets/cli.mjs upload ./cover.png --name mobile.workbench.cover --webp-width 720 --config tools/assets/asset-config.json
```

自动生成 WebP 按宽度缩小、校正方向、质量 82，并保留原图；需先 `pnpm --dir tools/assets install` 安装可选依赖 `sharp`，缺失时明确报错，不会悄悄跳过。也可使用 `--derived '{"thumb":"./thumb.webp"}'` 登记已经生成的派生图，此方式无第三方依赖。SVG、GIF 和多帧图片不会自动转换成静态图片。格式/哈希登记不代替上游不可信文件安全扫描。

## R2 / S3 适配

配置 `adapter: "s3"`，填写 `s3.bucket`、`s3.endpoint`、`s3.region` 和可选 `s3.profile`；公开域名填 `publicBaseUrl`。R2 的 endpoint 是账户的 S3 API 地址，region 可用 `auto`；公开域名与上传 endpoint 是两个地址。

需安装 AWS CLI；凭据从 AWS profile 或 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / 可选 `AWS_SESSION_TOKEN` 读取。CLI 使用无 shell 拼接的 `aws s3api put-object`，固定对象键，保留原始 Content-Type，内容版本设置不可变缓存，不调用公共图标服务。未配置 bucket/endpoint、未安装 CLI、无凭据或网络错误均失败，不把上传当成成功。

按官方 API 适配，未做真实云端上传验证。参考：[R2 AWS CLI](https://developers.cloudflare.com/r2/examples/aws/aws-cli/)、[R2 公共域名](https://developers.cloudflare.com/r2/buckets/public-buckets/)。

## 复用现有后端

配置 `adapter: "backend"`，`backend.baseUrl` 填 API 前缀，例如 `https://api.example.com/admin-api`。通过环境变量传入 `ASSET_BACKEND_TOKEN` 和可选 `ASSET_BACKEND_TENANT_ID`。

适配已有 `POST /infra/file/upload`，发送 `file`、`directory` multipart；后端同时执行实际存储和 FileDO 登记。只有 CommonResult `code = 0` 才成功。后端返回实际供应商 URL，该 URL 只存管理清单的 `storage.url`，不导出到客户端。

**后端现有上传接口会自动添加日期/随机后缀，所以返回路径与统一公开路径不同。** 本工具不修改后端路径策略：必须把归档 `objects/` 部署到公开静态站点，或在独立资源服务中按清单 `object.key → storage.url` 配置路由，才能使用配置的固定域名链接。当前未部署这种回源映射，不能把配置域名的生成结果当作已可访问的公网服务。后端不可达时，该适配不能上传；若公开图片从独立静态站点/R2 加载则可独立于业务后端。

```bash
node tools/assets/cli.mjs export-mapping --out ./routing-map.json --config tools/assets/asset-config.json
```

该管理侧映射包含**所有成功历史版本**的固定 key、SHA256、Content-Type 和实际供应商 URL/桶/对象键，可用于独立资源服务或 CDN 反代生成规则。不要把 routing-map 或完整 catalog 随客户端发布。它仅准备部署输入，不会自动建立公网服务。

## 存储与 CDN 迁移

先备份资源库，创建指向新存储的配置，但使用同一个 `library` 和自有 `publicBaseUrl`：

```bash
node tools/assets/cli.mjs migrate --config tools/assets/new-provider-config.json
```

逐张读取**所有成功历史版本**的归档文件，先全部校验 SHA256，再上传到新存储；资源 ID、版本号、原图和派生图对象键逐字不变。所有目标对象上传成功后才原子切换登记映射，并保留旧供应商位置。失败时所有旧映射与当前版本保持，已写入目标的对象登记在同一 catalog 的迁移记录中。同一配置重跑去重。CLI 当前通过供应商上传成功响应确认，不进行公网加载验收；正式切换域名回源前应在新源校验所有文件的哈希/可读性，重新导出 routing-map，最后调整域名/CDN回源，保留原源用于回退。供应商、桶或地域的配置更换不会自动完成域名切换。

若更换公开域名，所有资源名称仍保持不变，重新配置 `baseUrl` 就能统一更新名称引用；已经分发到外部的完整 URL 要保留旧域名转发才能稳定。不宣称仅改客户端配置就能让已发布旧 URL 自动变化。

## 客户端接入

CLI `export` 的公开清单只含资源 ID、版本和对象键。清单可随 App 打包；客户端无需实时向业务后端查询链接，上传凭据和管理清单不能随 App 打包。

uni 模块：`apps/call-phone-uni/src/modules/assets/index.ts`，见该目录 README。CLI 默认没有替项目页面生成业务资源或搬迁现有图片。

程序调用与 CLI 一致：

```js
import { loadConfig, uploadAsset, queryAssets, exportManifest } from './core.mjs'
const config = await loadConfig('./asset-config.json')
const resource = await uploadAsset(config, { name: 'mobile.cover', file: './cover.png' })
console.log(resource.variants.original.url)
```
