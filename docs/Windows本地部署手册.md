# SSH 工具箱 — Windows 下载与本地部署手册

本文说明如何从 GitHub 克隆 **SSH 工具箱（Windows 版）**（`ssh-toolbox-windows`），在 Windows 上完成安装、运行与可选打包。

- 仓库地址：https://github.com/langzf/ssh-toolbox-windows  
- 适用系统：**Windows 10 / 11（64 位）**

---

## 一、环境准备

### 1.1 安装 Git

在 **PowerShell** 或 **命令提示符** 中执行：

```powershell
git --version
```

若未安装，请从 [git-scm.com/download/win](https://git-scm.com/download/win) 下载并安装 Git for Windows。

### 1.2 安装 Node.js（18 或更高）

```powershell
node --version
npm --version
```

推荐使用 **Node.js 18 LTS 或 20 LTS**：https://nodejs.org/

安装时勾选 **Add to PATH**，以便在任意终端使用 `node` 与 `npm`。

### 1.3 本机 SSH（连接远程服务器时）

- 连接 **远程 Linux 服务器**：确保对方已开启 SSH（端口一般为 22）。  
- 连接 **本机 Windows**：在 **设置 → 系统 → 可选功能** 中安装 **OpenSSH 服务器**，并在 **服务** 中启动 `sshd`（默认端口 22）。

私钥默认路径：`%USERPROFILE%\.ssh\`（例如 `id_ed25519`、`id_rsa`）。

---

## 二、从 GitHub 下载代码

### 2.1 选择存放目录

例如 `D:\dev` 或 `C:\Users\你的用户名\Projects`。

### 2.2 克隆仓库

```powershell
cd D:\dev
git clone https://github.com/langzf/ssh-toolbox-windows.git
cd ssh-toolbox-windows
```

### 2.3 安装依赖

```powershell
npm install
```

首次安装会下载 Electron 等依赖，可能需要几分钟。

---

## 三、运行应用

### 3.1 推荐方式：start.bat

在资源管理器中双击 **`start.bat`**，或在项目目录执行：

```powershell
.\start.bat
```

脚本会清除可能干扰 Electron 的 `ELECTRON_RUN_AS_NODE` 环境变量。

### 3.2 使用 npm

```powershell
npm start
```

若在 Cursor / VS Code 集成终端中报错「Electron API 未加载」，请先执行：

```powershell
$env:ELECTRON_RUN_AS_NODE = $null
npm start
```

或在 **cmd** 中：

```cmd
set ELECTRON_RUN_AS_NODE=
npm start
```

### 3.3 自检

```powershell
npm run check
```

---

## 四、可选：打包为 Windows 安装程序

在 **Windows 本机** 上执行（无法在 macOS 上交叉打包 Windows 安装包）：

```powershell
npm run pack
```

生成文件通常在：

```
dist\SSH 工具箱 Setup 1.0.0.exe
```

仅生成免安装目录（调试用）：

```powershell
npm run pack:dir
# 输出: dist\win-unpacked\SSHToolbox.exe
```

### 4.1 安装与 SmartScreen

1. 运行上述 `.exe` 安装程序，按向导完成安装。  
2. 若 Windows SmartScreen 提示「未知发布者」，可点 **更多信息** → **仍要运行**（自签名或未购买代码签名证书时常见）。

### 4.2 更新已安装版本

退出正在运行的旧版 → 运行新安装包覆盖安装 → 再启动应用。

---

## 五、使用说明

1. 侧栏 **Inventory → Servers**，点 **+ 新建服务器**  
2. **仅保存**：填主机名 + 用户名后点 **保存**  
3. **连接**：填密码或私钥后点 **连接**；私钥留空会自动尝试 `%USERPROFILE%\.ssh\` 下的默认密钥  
4. **Snippets**：保存常用命令，在已连接终端中点击发送  
5. **SFTP**：连接后点工具栏 **SFTP**，可浏览、上传、下载文件  

---

## 六、数据存储位置

应用数据保存在本机用户目录，例如：

```
%APPDATA%\local-webssh-windows\
```

包含已保存主机、片段、主题设置等（密码经系统加密存储）。**不会**随 `git clone` 下载，也不会打进安装包。

---

## 七、常见问题

| 现象 | 处理 |
|------|------|
| `npm start` 报 Electron API 未加载 | 使用 `start.bat` 或清除 `ELECTRON_RUN_AS_NODE` |
| 连接本机被拒绝 | 安装并启动 OpenSSH Server，检查防火墙是否放行 22 端口 |
| 认证失败 | 检查用户名、密码或私钥路径；确认 `%USERPROFILE%\.ssh` 下密钥存在 |
| 打包需在 Windows 执行 | `electron-builder --win` 需在 Windows 环境运行 |

---

## 八、与 macOS 版的关系

| | macOS 版 (`ssh-toolbox`) | Windows 版 (`ssh-toolbox-windows`) |
|---|--------------------------|-------------------------------------|
| 仓库 | https://github.com/langzf/ssh-toolbox | https://github.com/langzf/ssh-toolbox-windows |
| 启动 | `./start.sh` 或 `npm start` | `start.bat` 或 `npm start` |
| 打包 | `.app`（mac-arm64） | `.exe`（NSIS） |

功能与界面基本一致，按平台分别维护。
