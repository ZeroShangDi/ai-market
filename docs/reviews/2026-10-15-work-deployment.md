# Work 实际部署与手机入口验收

日期：2026-10-15，北京时间。用户要求核对 Workbuddy 远程更新是否成功，不完整时补齐部署。

## 核对结论

Workbuddy 已更新运行容器：Agent 中 server.js、work.js、work-executor.js 与最新提交一致，内部 Work 路由存在，Java 手机入口也实际可创建 Work 会话。不能继续沿用旧开发记录中的「未部署」结论。

当时尚有部署缺口：后台只绑定127.0.0.1，手机现用100.87.254.68无监听；Docker 默认 seccomp 阻止 bubblewrap 非特权命名空间。文档库经过逐项复核已安装，无需重复安装。

## 补齐内容

- 合并原 compose.local.yml、compose.tailscale.yml、compose.app-update.yml、compose.ai.yml、compose.agent.yml，恢复原 Tailscale 100.87.254.68:48080，同时保留回环入口、公共更新文件目录和全部数据卷。
- Agent 使用固定版官方 Moby seccomp allowlist，追加 bubblewrap 所需的用户/挂载命名空间系统调用。以 node 运行，cap_drop ALL、no-new-privileges；不使用 privileged、SYS_ADMIN 或 seccomp unconfined。
- Docker 默认 masked/readonly systempaths 会阻止完整内层沙箱挂载独立/proc，部署使用 systempaths=unconfined 清除此限制；外层根文件系统只读，/data持久卷和256MiB独立/tmp可写，无宿主目录、Docker socket或宿主PID挂载。
- SDK 显式 enableWeakerNestedSandbox=false，不采用会暴露外层进程视图的较弱嵌套模式；failIfUnavailable=true、allowUnsandboxedCommands=false 保持不变。
- 在只读挂载前预建 SDK 固定保护目录与空配置，不覆盖原文件，不跟随链接，避免 .claude 子路径创建失败。移除重复的/dev/fd别名屏蔽路径，继续使用完整沙箱和/proc规则。
- 构建镜像复用已部署的相同依赖层，仅更新服务源码。最终 Agent 镜像 `27b9e56245f4`；后台与AI运行镜像保留 Workbuddy 已部署版本。服务全部健康，数据和配对保留。

策略来源及许可证见 [security/README.md](../../apps/agent-service/security/README.md)。官方依据：[Docker seccomp](https://docs.docker.com/engine/security/seccomp/)、[SDK 沙箱说明](https://code.claude.com/docs/en/sandboxing)。

## 真实验收

在手机实际使用的 `http://100.87.254.68:48080` 调用鉴权手机 API，使用合成 CSV、虚拟设备和真实 DeepSeek/官方 SDK；不读取客户资料，不拨号，不批准额外高风险操作。

```
python3 scripts/work-api-live-smoke.py --exercise --base http://100.87.254.68:48080
python3 scripts/work-api-live-smoke.py --exercise --base http://100.87.254.68:48080 --boundaries-only
```

最终完整配置下全部通过：

1. 真实扫码范围登录、设备认证、本人产品会话、Work映射幂等。
2. 上传原始CSV，真实SDK调用Bash/隔离Python并实际import pypdf/docx/openpyxl/pptx，发布文件；二进制下载字节与预期完全相同，App内容下载与二进制一致。
3. 同一原生SDK会话继续修改文件，追加内容正确，旧产物保持不变；手机SSE能回放持久事件。
4. 实际命令生成固定验收标签：PRIVATE_BLOCKED、ENV_HIDDEN、PROC_ISOLATED、CONFIG_BLOCKED。私有映射不可读、模型密钥不进入命令环境、外层node服务进程不可见、保护配置不可写。没有输出环境变量值或文件正文。

19项Agent离线测试通过，新增真实文件占位初始化/保持原内容/符号链接拒绝验证。Compose实际启动及只读/tmpfs/最小权限配置已从容器状态复核。127.0.0.1和100.87.254.68健康接口均UP。合成会话结束关闭，虚拟设备及配对撤销，测试产品聊天删除；Work审计及合成产物保留。

早期探针在较长临时目录遇到Unix socket桥接失败；随后在实际持久目录及真实手机API复验，不把临时目录失败算作产品通过。另曾评估较弱嵌套模式，其文件处理能完成但进程可见性不符合最终要求，已撤回，以上最终验证均基于完整沙箱配置。

验收日志：/private/tmp/work-api-live-final.log、work-api-boundary-final.log、work-deploy-tests.log。手机系统选文件、打开/保存产物及实际界面交互仍待真机操作，本记录证明实际部署API及真实执行链路，不冒充真机验收。

## 使用和后续启动

现有1.0.10 APK可以直接连接，无需因本次后端修复重打包或重新配对。保持电脑后台和手机Tailscale在线，重新打开AI页面的Work入口即可。

从 apps/ruoyi-vue-pro 启动/更新时保留完整文件列表，不能遗漏 compose.tailscale.yml 或 compose.app-update.yml：

```sh
CALLPHONE_TAILSCALE_IP=100.87.254.68 docker compose \
  -f compose.local.yml -f compose.tailscale.yml -f compose.app-update.yml \
  -f ../ai-service/compose.ai.yml -f ../ai-service/compose.agent.yml \
  --profile ai --profile agent up -d --build --wait server ai-service agent-service
```

不能同时启动两个Agent实例写同一/data目录，不执行down -v。更换宿主时先验证完整bubblewrap沙箱，不通过时明确失败，不自动关闭隔离。
