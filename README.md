# ServerCat（自研版）

一个类似 App Store 上 ServerCat 的 iOS 应用：通过 SSH 连接 Linux 服务器，实时展示
CPU / 内存 / 磁盘 / 网络监控图表，管理 Docker 容器，并内置完整的 SSH 终端（xterm.js + PTY）。

> 技术栈：Expo SDK 57（React Native 0.86）+ 原生 SSH 模块（NMSSH / libssh2）+ xterm.js

## 功能

- **服务器列表**：状态指示灯、CPU/内存摘要与迷你趋势图
- **实时监控**：2 秒级轮询，CPU / 内存 / Swap / 磁盘 / 网络速率曲线（60 点滚动历史）
- **Docker 管理**：容器列表、CPU/内存占用、启动/停止/重启/暂停、查看日志
- **SSH 终端**：xterm.js 全功能终端（PTY），快捷键栏（Esc/Tab/Ctrl/方向键）
- **安全**：密码/私钥仅存于 iOS 钥匙串（expo-secure-store），元数据存本地

## 开发（Windows）

```bash
npm install                 # 安装依赖
npm run build:terminal      # 打包 xterm 为 assets/terminal.html（已随仓库生成）
npm start                   # 启动 Metro，用 iPhone 上的 Expo Go 扫码预览
```

**Expo Go 中自动进入演示模式**（Mock SSH 数据），可开发全部 UI；
真实 SSH 功能需要构建原生 IPA（见下）。

## 构建 IPA（无需 Mac）

GitHub Actions 在 macOS runner 上构建**未签名 IPA**：

```bash
git tag v1.0.0 && git push origin v1.0.0   # 或在 Actions 页手动触发
```

产物下载：Actions → Artifacts → `ServerCat-unsigned.ipa`（tag 构建会附加到 Release）。

安装到 iPhone（免费 Apple ID，7 天自动续签）：见 [docs/INSTALL.md](docs/INSTALL.md)。

## 目录结构

```
src/
  app/                # expo-router 页面（列表/详情/终端/日志/设置）
  components/         # Card / AreaChart / UsageBar
  services/           # 连接管理、/proc 解析、Docker 命令
  ssh/                # SSH 抽象层：原生实现 + Mock 实现（自动切换）
  store/              # zustand 持久化（AsyncStorage + Keychain）
  terminal/           # xterm.js 源码（esbuild 打包进 assets/terminal.html）
modules/
  react-native-ssh/   # 原生 SSH 模块（ObjC，封装 NMSSH）
.github/workflows/    # macOS 云构建
```

## 已知限制

- NMSSH 内置 libssh2 1.8：不支持 ed25519 密钥；对 OpenSSH ≥ 8.8 的服务器使用
  RSA 密钥登录可能失败（服务器默认拒绝 ssh-rsa 签名）。建议用密码或 ECDSA 密钥。
- 免费 Apple ID 签名 7 天过期，SideStore 会在后台自动续签（需保持其 VPN 开启）。
