# 连接故障排查

App 内任何连接问题都会显示具体错误信息。按下表对照处理：

## 连接阶段报错

| 报错 | 原因与处理 |
|---|---|
| `连接失败：Operation timed out` / `Couldn't connect` | 主机/端口不通。检查 IP、端口、服务器防火墙、安全组；确认手机和服务器在同一网络或服务器有公网地址 |
| `认证失败：Authentication failed` | 用户名/密码错误；或服务器禁止密码登录（见下） |
| 密码正确但认证失败 | 服务器可能只允许 keyboard-interactive（App 已自动回退尝试）或仅允许密钥登录 |

## 私钥登录问题（重要）

App 内置的 libssh2 为 1.8 版（与 App Store 版 ServerCat 同源的 NMSSH 库），有两个限制：

1. **RSA 密钥 vs OpenSSH 8.8+ 服务器**：新版 sshd 默认拒绝 `ssh-rsa`（SHA-1）签名，
   RSA 私钥登录会失败。两种解法：
   - 在服务器上换 ECDSA 密钥：`ssh-keygen -t ecdsa -f ~/.ssh/id_ecdsa`，
     `cat ~/.ssh/id_ecdsa.pub >> ~/.ssh/authorized_keys`，App 里粘贴 `id_ecdsa` 私钥全文
   - 或在服务器 `/etc/ssh/sshd_config` 加 `PubkeyAcceptedAlgorithms +ssh-rsa` 后 `systemctl reload ssh`
2. **不支持 ed25519 密钥**：请改用 ECDSA（`ssh-keygen -t ecdsa`）

## 监控数据显示问题

| 现象 | 原因 |
|---|---|
| CPU/内存一直是 0 或空 | 服务器不是标准 Linux（如群晖/路由器固件的 /proc 格式不同）；把 `设置 → 关于` 里的版本号和服务器系统发我 |
| Docker 显示「未安装或无权限」 | 服务器没装 Docker，或当前用户不在 docker 组。临时：`sudo usermod -aG docker 用户名` 后重新登录 SSH |
| 网络速率为 0 | 全部流量都在回环/被排除的虚拟网卡上，属正常现象 |

## 终端问题

- **黑屏无输出**：shell 会话建立失败，点标题栏右侧刷新按钮重连
- **断开后无响应**：点刷新按钮重新建立会话
- **中文乱码**：服务器 locale 不是 UTF-8，执行 `export LANG=C.UTF-8` 或安装 locale

## 仍然不行？

把以下信息发给我：
1. App 里显示的完整错误文字
2. 服务器系统（`cat /etc/os-release` 第一行）与 sshd 版本（`sshd -V` 或 `ssh -V`）
3. 复现步骤
