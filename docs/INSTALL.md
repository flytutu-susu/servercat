# 安装到 iPhone（免费 Apple ID，无需 Mac）

本指南适用于 **Windows + iPhone**，使用 SideStore 签名安装，之后每 7 天自动续签。

## 一、安装 SideStore（一次性）

1. **下载工具**（都在 Windows 上操作）：
   - 安装 [iTunes](https://www.apple.com/itunes/download/win64)（不要装 Microsoft Store 版）
     和 [iCloud](https://updates.cdn-apple.com/2020/windows/001-39935-20200911-1A70AA56-A448-11EA-8CC0-99D41950005E/iCloudSetup.exe)
     （Apple 官网直链版），装好后各打开一次并登录 Apple ID。
   - 下载 AltServer（Windows 版）：https://cdn.altstore.io/file/altstore/altinstaller.zip
   - 下载 SideStore IPA：https://github.com/sidestore/sidestore/releases/latest（`SideStore.ipa`）

2. iPhone 用数据线连接电脑，iTunes 中信任此电脑并勾选「通过 Wi-Fi 与此 iPhone 同步」。

3. 运行 AltServer（托盘图标）→ `Install AltStore` → 选择你的 iPhone → 输入 Apple ID
   邮箱和密码（仅发送给苹果服务器）。这会把 AltStore 装到手机上。

4. 手机上打开 AltStore → 登录同一 Apple ID → 点 `+` 选择下载好的 SideStore.ipa 安装。
   （也可按 SideStore 官网的其它方式安装。）

5. 手机 `设置 → 通用 → VPN与设备管理` 中信任你的开发者证书；
   `设置 → 隐私与安全性 → 开发者模式` 开启（安装过开发者应用后才会出现，开启需重启）。

6. 打开 SideStore，按提示开启 **LocalDevVPN**（一个本地 VPN 配置，用于后台自动续签）。

## 二、安装本应用

1. 从 GitHub 下载 `ServerCat-unsigned.ipa`（Actions 产物或 Release），
   通过 iCloud 云盘 / 微信文件传输 / 数据线 传到 iPhone。
2. 打开 SideStore → `My Apps` → 左上角 `+` → 选择该 IPA。
3. SideStore 会用你的免费 Apple ID 签名并安装。桌面出现 **ServerCat** 图标即完成。

## 三、续签（重要）

- 免费证书 **7 天过期**。只要 SideStore 的 LocalDevVPN 保持开启，SideStore 会在后台
  自动续签，应用不会失效。
- 若偶尔失效：打开 SideStore → My Apps → 点 ServerCat 旁的「7 days」手动刷新即可。

## 四、常见问题

- **打不开应用 / 提示不受信任的开发者**：设置 → 通用 → VPN与设备管理 → 信任你的 Apple ID。
- **RSA 私钥登录失败**：NMSSH 的 libssh2 1.8 不支持服务器要求的 rsa-sha2 签名
  （OpenSSH 8.8+ 默认）。换用密码登录，或在服务器上生成 ECDSA 密钥：
  `ssh-keygen -t ecdsa`，并把私钥粘贴到 App 中。
- **连接提示认证失败但密码正确**：部分服务器只开 keyboard-interactive，App 已自动回退尝试。
