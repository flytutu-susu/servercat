# 安装到 iPhone（免费 Apple ID，无需 Mac）

本指南适用于 **Windows + iPhone**（含 iOS 26），目标是在手机上装好 SideStore（签名工具），
再用它安装本应用。之后每 7 天自动续签。

## 一、安装 SideStore（一次性）

### 方式 A：iloader（推荐，最简单）

iloader 是 SideStore 官方推荐的新安装器（SideStore 0.6.3+），**不需要 iCloud**，
iTunes 用 Microsoft Store 版也可以，并且能自动导入配对文件。

1. 安装 iTunes（[Microsoft Store 版](https://apple.co/ms) 或
   [官网经典版](https://www.apple.com/itunes/download/win64) 均可，装完打开一次）。
2. 下载 iloader：官网 https://iloader.app 或
   [GitHub Releases](https://github.com/nab138/iloader/releases)（Windows 版）。
3. iPhone 用数据线连电脑（手机上点「信任」）→ 打开 iloader → 登录你的 Apple ID
   → 点 **Install SideStore**。

### 方式 B：AltServer（经典方式）

1. 安装 [iTunes](https://www.apple.com/itunes/download/win64)
   和 [iCloud](https://updates.cdn-apple.com/2020/windows/001-39935-20200911-1A70AA56-F448-11EA-8CC0-99D41950005E/iCloudSetup.exe)
   —— 两个都必须是**官网版**（不能用 Microsoft Store 版），装好后各打开一次并登录 Apple ID。
2. iPhone 数据线连电脑，iTunes 中信任此电脑并勾选「通过 Wi-Fi 与此 iPhone 同步」。
3. 下载运行 [AltServer](https://cdn.altstore.io/file/altstore/altinstaller.zip)（托盘图标）
   → `Install AltStore` → 选择你的 iPhone → 输入 Apple ID。
4. 手机上打开 AltStore → 登录同一 Apple ID → 点 `+` 选择
   [SideStore.ipa](https://github.com/sidestore/sidestore/releases/latest) 安装。

### 装完 SideStore 后

1. 手机 `设置 → 通用 → VPN与设备管理` → 信任你的开发者证书。
2. `设置 → 隐私与安全性 → 开发者模式` → 开启（需重启手机一次）。
3. 打开 SideStore，按提示开启 **LocalDevVPN**（本地 VPN，用于后台自动续签）。
   - ⚠️ **iOS 26.4+** 若开 VPN 报错，用方式 A 的 iloader 重新安装 SideStore 即可修复。

## 二、安装本应用（ServerCat）

1. iPhone Safari 打开 https://github.com/flytutu-susu/servercat/releases/latest
   （登录你的 GitHub）下载 `ServerCat-unsigned.ipa`；
   或从电脑 `dist\ServerCat-unsigned.ipa` 传到手机（iCloud 云盘/微信/数据线皆可）。
2. 打开 SideStore → `My Apps` → 左上角 `+` → 选择该 IPA。
3. SideStore 用你的免费 Apple ID 签名并安装。桌面出现 **ServerCat** 图标即完成。

## 三、续签（重要）

- 免费证书 **7 天过期**。只要 SideStore 的 LocalDevVPN 保持开启，SideStore 会在后台
  自动续签，应用不会失效。
- 若偶尔失效：打开 SideStore → My Apps → 点 ServerCat 旁的「7 days」手动刷新即可。

## 四、常见问题

- **打不开应用 / 提示不受信任的开发者**：设置 → 通用 → VPN与设备管理 → 信任你的 Apple ID。
- **AltServer 提示找不到 iPhone**：确认 iTunes/iCloud 都是官网版且已登录；数据线直连；
  手机上点了「信任此电脑」。不行就换方式 A（iloader）。
- **私钥登录**：v1.1.0 起支持 ed25519 / RSA（含新版服务器的 rsa-sha2）/ ECDSA 私钥，
  粘贴完整 PEM/OpenSSH 格式私钥即可。
- **连接提示认证失败但密码正确**：部分服务器只开 keyboard-interactive，App 已自动回退尝试。
- 更多连接问题见 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)。
