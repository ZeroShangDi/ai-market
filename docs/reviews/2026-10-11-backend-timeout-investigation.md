# 后端请求超时排查（2026-10-11）

用户反馈“其他模型后端总是请求超时”。目前尚未提供具体模型、请求路径和报错样本；以下为本机客户侧服务可复现的事实，不能据此断言所有模型超时都已找到唯一根因。

## 复现

在正常沙箱外使用有界只读检查，排除沙箱 EPERM 与系统 HTTP 代理干扰：

- `docker context show` 返回 `desktop-linux`。
- `docker info --format '{{.ServerVersion}}'` 8 秒内无输出，由诊断进程终止该查询。
- `curl --noproxy '*' --connect-timeout 2 --max-time 3 http://127.0.0.1:48080/actuator/health` 返回 28：3 秒内收到 0 字节。
- `lsof` 确认 `127.0.0.1:48080` 与 `127.0.0.1:13306` 由 `com.docker.backend` 监听；端口存在不代表容器服务健康。
- `docker desktop start --detach --timeout 15` 报告已运行，没有解决引擎查询超时。
- 已尝试普通 `docker desktop restart --timeout 45`；超过 90 秒仍未返回，原 Docker backend 进程未更换。停止的是此次发起的挂起 restart CLI 及其 CLI 插件进程，没有删除容器、镜像或数据卷，也没有强杀引擎。

结论：本机 Docker 引擎/虚拟机控制链路无响应，已足以造成使用其转发端口的后端请求挂起。当前证据不支持仅通过增大手机 15 秒 HTTP 超时解决。仓库默认构建没有启用 `yudao-module-ai`，不应未经确认就修改该模块的模型供应商超时配置。

## 深入定位与恢复（2026-10-11 01:28，Asia/Shanghai）

进一步检查本机日志和进程，找到以下关联证据（下列时间为本地时间）：

- 10 月 6 日 00:39:42，`log/vm/kmsg.log` 记录虚拟磁盘 `vda` 大量写入 I/O 错误。00:39:43 文件系统日志中止，`vda1` 被重新挂载为只读。
- 00:41:09，`log/host/com.docker.virtualization.log` 记录宿主写日志失败：`no space left on device`。空间不足是强相关诱因，但不能仅凭这些日志排除其他底层存储问题。
- 00:46:42，虚拟机停止；随后没有成功启动记录。此次检查也没有虚拟机进程，`Docker.raw` 没有打开者。
- Docker backend 残留进程仍占有 48080 端口，向已经停止的虚拟机转发请求，解释了“可以连接但一直没有响应”。普通重启日志显示其卡在等待这些进程退出。
- 当前宿主剩余空间约 22 GiB；`Docker.raw` 逻辑容量 228 GiB，实际占用约 30 GiB，不能把逻辑容量误认为已占满宿主磁盘。

恢复操作：先向已确认的残留 Docker UI/backend/build 进程发送 TERM；服务子进程退出，失效端口释放。唯一管理父进程仍不退出，短时采样显示线程等待；在确认虚拟机与服务进程已停止后，仅结束该残留父进程，再重新启动 Docker Desktop。未重置 Docker、删除镜像/容器/卷，未修改业务数据。

恢复验证：

- Docker 引擎恢复响应，报告版本 `28.3.2`。
- 项目 MySQL、Redis 容器 healthy，server 运行。
- `/actuator/health` 返回 HTTP 200、`UP`，首次约 0.134 秒；后续连续检查通过。
- `/api/v1/mobile/bootstrap` 约 0.019 秒返回应用层未登录响应，证明接口恢复及时响应；这不等同于已完成认证业务联调。
- MySQL `read_only`、`super_read_only` 均为 0；实际 `cp_customer` 表读取成功；会话临时表创建/插入/读取/删除通过，没有改动业务记录。Redis 返回 `PONG`。

仍存在的存储风险：本次启动日志提示 `mounting fs with errors, running e2fsck is recommended`，随后以读写方式挂载成功。本次恢复解决了服务无响应，但没有证明历史文件系统错误已修复。需要先备份数据，再安排停止虚拟机后的文件系统检查；不能对运行中的文件系统直接修复。

## 后续验证

1. 先备份重要数据库、录音与数据卷，并保持宿主磁盘有可用空间；安排离线虚拟磁盘检查。不要执行 factory reset、`compose down -v` 或 prune。
2. 10 月 11 日上午已离线构建并部署本轮后端，备份数据库并应用既有 v44–v56 幂等迁移；本机和局域网入口均恢复可用。
3. 已用本地测试账号运行 `scripts/callphone-integration-smoke.py --exercise`，通过配对、派发、结果保存及重放、延迟结束观察及重放、拒绝、取消和设备撤销；真机拨号、录音和冷启动仍待验证。
4. 提供出现问题的模型/工具名称、请求 URL 路径（去掉 token）与错误时间，分别判断模型供应商请求、模型工具访问 localhost、服务不可达、鉴权错误和真实慢请求。对于 localhost 访问，模型工具必须运行在能访问该主机的环境。

状态：本机 Docker/后端无响应已定位并恢复，数据库基本读写通过；历史虚拟磁盘错误未完成离线检查，具体模型请求仍需原路径重试确认。
