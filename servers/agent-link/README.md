# @ai-market/agent-link

局域网内「手机 ↔ 桌面 Agent」的配对、消息与交互服务。

从 DSH 控制插件的 `lib/phone` 抽离，改为独立 TypeScript npm 包；插件不再保留副本。

## 能力

- 一次性二维码 + 6 位配对码（5 分钟）
- 手机 claim 后获得 Bearer token，服务端只存 SHA-256
- 双向消息、游标、长轮询，7 天 / 500 条保留
- 审批（允许/拒绝）与问题（选择/填空）等待手机作答
- 配对页可查看设备、刷新二维码、解绑

## 开发

```sh
npm install
npm run build
npm test
```

- `src/*.ts` 源码，`tsc` 输出 `dist/*.js` + `.d.ts`
- package 通过 `main` / `types` / `exports` 暴露 `createPhoneLink`
- 二维码使用 npm 依赖 `qrcode`，不内置 vendor

## 运行

```sh
npm start -- --name dsh --port 34120
# 或者构建后
node bin/agent-link.js --name dsh --port 34120
```

启动后打印：

```
配对页: http://127.0.0.1:34120/pair?key=...
扫码内容: http://192.168.x.x:34120/p?v=1&c=...&s=...&n=dsh&i=dsh
```

手机与电脑需在同一局域网；跨网由 Tailscale 等外部方案提供地址，协议不变。

## 作为库使用

```ts
import { createPhoneLink } from '@ai-market/agent-link';

const link = createPhoneLink({
  dataDir: '/path/to/data',
  agentName: 'dsh',
  port: 34120,
  onMessage: async (message) => {
    // 交给宿主：DSH session.prompt、Codex、Claude Code…
  }
});

const info = await link.start();
link.send('收到，我在。');
```

## HTTP 接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/pair?key=` | 页面 key | 配对页 |
| GET | `/p?c=&s=&n=&i=` | 无 | 扫码落地页 |
| GET | `/api/health` | 无 | 存活与配对状态 |
| GET | `/api/pair/status?key=` | 页面 key | 配对状态 |
| POST | `/api/pair/new` | 页面 key | 刷新二维码 |
| POST | `/api/pair/revoke` | 页面 key | 解绑并刷新 |
| POST | `/api/pair/claim` | 配对码 + secret | 手机绑定，返回 token |
| GET | `/api/messages?after=` | Bearer | 游标取消息 |
| GET | `/api/messages/wait?after=&timeout=` | Bearer | 长轮询（≤25s） |
| POST | `/api/messages` | Bearer | 手机发消息（`text`、`clientId`） |
| POST | `/api/approvals/decision` | Bearer | `{id, decision:'allow'|'deny'}` |
| POST | `/api/questions/answer` | Bearer | `{id, answers:[{id,selected,custom?}]}` |
| POST | `/api/unbind` | Bearer | 手机端解绑 |

## 测试

`npm test` 使用 vitest，覆盖消息/长轮询、审批与问题接口、页面 key 与解绑。
