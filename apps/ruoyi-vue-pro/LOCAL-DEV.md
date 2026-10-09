# Call Phone 本地开发环境

## 启动

在 `apps/ruoyi-vue-pro` 目录运行以下命令，会等待 MySQL、Redis 与 Yudao API 健康后启动 Vue 管理端：

```sh
./script/callphone-local-up.sh --with-ui
```

管理端运行在前台 `http://127.0.0.1:5175`。按 `Ctrl-C` 只停止 Vite；Docker 中的 API、MySQL 和 Redis 继续运行。若只想启动后端，运行 `./script/callphone-local-up.sh`。

在 `env.local` 开发模式下，登录后的动态菜单/路由只装配 Call Phone 根菜单及其第三级页面；Yudao 的用户、部门、角色和权限 API 继续复用，但其他产品页面暂不加入本地导航。静态 Yudao 首页也会从侧栏隐藏，访问 `/` 或 `/index` 会进入 Call Phone 通话记录页。该过滤只存在于本地开发运行时，不更新或删除 `system_menu` 数据，生产构建和其他 Yudao 开发模式保留完整菜单。

脚本会在本地首次启动时生成权限为仅当前用户可读写的 `.env.local`，里面存 Call Phone 客户隐私字段的 AES-256-GCM 开发密钥和空的核心服务主机白名单。使用账户授权功能前，请将 `CALLPHONE_CORE_ALLOWED_HOSTS` 配成受信任的核心服务 HTTPS 精确主机名（多个主机用逗号分隔）。该文件已加入 Git 忽略及 Docker build ignore；不要删除或提交它，否则本地加密数据将无法解密。

Docker 会启动 MySQL、Redis，并通过多阶段镜像构建 Yudao 后端。启动脚本会等待 MySQL/Redis 健康检查通过，幂等应用 v44–v56 Call Phone 升级脚本，再等待 `/actuator/health/` 正常后报告服务可用。宿主机运行后端使用 `127.0.0.1:13306` 连接 MySQL、`127.0.0.1:16379` 连接 Redis；`3306` 和 `6379` 是容器网络内端口，Compose 启动后端时分别覆盖为 `mysql:3306` 和 `redis:6379`。首次启动 MySQL 时会导入 Yudao 基础表、Call Phone 合并基线、后续增量表和菜单 SQL；初始化脚本跳过已合并进基线的 v2、v7、v8 ALTER，避免新库重复添加字段；v54 将企微存档清理用途标为用户/系统、启用每 15 分钟租户清理任务，并将备份 schema 提升到 54；v55 增加客户负责人变更审计表、批量分配/标签权限和 schema 55；v56 增加企微运营审批按钮权限，不改业务表或备份 schema。v51 和 v52 只新增 Call Phone 菜单权限，不变更备份 schema 版本；v53 仅修正历史通话完成时错误推进的派发状态，不新增/删除业务数据表；v54 按保留期物理删除过期存档密文。其他已有版本应依据实际版本按顺序补齐缺失的模块升级 SQL 和菜单 SQL，不能直接重建 volume。

管理端需 Node.js 20.19+（推荐 Node 22 LTS，需 22.13+）和 pnpm。前端目录的 `.nvmrc` 锁定主版本 22，依赖引擎范围也会在包管理器检查时给出提示。也可以在 `yudao-ui-admin-vue3` 目录独立运行 `pnpm dev -- --host 127.0.0.1 --port 5175 --strictPort`；已有 `node_modules` 时不用重新安装依赖。不要使用 Node 18，当前 Vite、ESLint、Stylelint 均不支持该版本。

| 服务 | 地址 |
|---|---|
| Vue 管理端 | `http://127.0.0.1:5175`（可由一键启动脚本启动） |
| Call Phone 本地预览 | `http://127.0.0.1:5175/callphone-preview?preview=1`（隔离显示 Call Phone 页面；含客户列表、企微客户/客户群/客户运营/会话存档、跟进事项、客户阶段、通话记录、线索池、分配与回收、线索跟进/转化/归档、手机设备、电脑与配对、业务字典、阶段与结果配置） |
| Yudao API | `http://127.0.0.1:48080` |
| MySQL | `127.0.0.1:13306` |
| Redis | `127.0.0.1:16379` |

停止服务但保留数据库：

```sh
docker compose -f compose.local.yml down
```

## 已知边界

- 页面预览用明确标记的样例数据，并保存在当前浏览器 localStorage；它可检查客户、跟进和线索池到领取、跟进、转化/归档的界面操作串联。真实业务数据仍需后端正常启动、登录和完成迁移后使用。
- Call Phone 含明文 PII 的写接口关闭 API 访问日志请求体；本地 profile 同时关闭开发拦截器的请求体控制台日志。
- 密钥轮换/恢复、正式数据库升级框架及剩余第三级页面与 API 仍按逐页交付状态表推进。
