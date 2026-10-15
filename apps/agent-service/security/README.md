# Work 容器 seccomp

`work-seccomp.json` 复用 Moby 官方默认 allowlist，固定来源：

- https://github.com/moby/profiles/blob/6fe7deb1b9fb7c0397a4593480d7d22b9ee8caef/seccomp/default.json
- 上游原文件 SHA256：`6416b47770785a41ac59073cdc77d9fe98517df2799dc83ef207e622de3053f6`
- Apache-2.0 许可证保存在 LICENSE.moby。

仅追加 bubblewrap 在嵌套用户/挂载命名空间中使用的 mount、umount2、pivot_root、setns、unshare，以及带 CLONE_NEWUSER 的 clone。保留默认 SCMP_ACT_ERRNO 和其他系统调用限制。容器以 node 用户运行，cap_drop ALL、no-new-privileges，不授予 SYS_ADMIN，不使用 privileged 或 seccomp unconfined。

内核仍校验非特权用户命名空间和挂载权限；此策略不保证任意 Linux 宿主均支持，部署必须实际验证 SDK 沙箱命令与文件/凭据边界。不能用关闭 SDK 沙箱来绕过部署失败。

Docker 默认 masked/readonly systempaths 会阻止非特权命名空间挂载独立 `/proc`。Compose 使用 `systempaths:unconfined` 清除此挂载限制，并保持非 root、cap_drop ALL、no-new-privileges、只读根文件系统和独立受限 tmpfs。这不等于 seccomp unconfined，也不授予 SYS_ADMIN。不要给容器挂 Docker socket、宿主私有目录或宿主 PID namespace。

SDK 显式 `enableWeakerNestedSandbox:false`，每条 Bash 继续进入完整文件/网络/进程沙箱。曾评估官方嵌套兼容模式，但它暴露外层进程视图，最终未采用。验收需要确认私有映射不可读、模型密钥不进入命令环境、容器服务的外层进程不可见、配置不可写。依据：[Docker seccomp](https://docs.docker.com/engine/security/seccomp/)、[SDK 容器沙箱说明](https://code.claude.com/docs/en/sandboxing#bubblewrap-fails-to-start-inside-a-container)。
