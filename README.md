# SSH 工具箱

macOS 桌面 SSH 客户端（Electron），支持多会话终端、SFTP 文件传输、保存主机与 Snippets。

📖 **Git 克隆部署** → [docs/本地部署手册.md](docs/本地部署手册.md)  
📦 **npm 安装（推荐给他人）** → [docs/npm安装说明.md](docs/npm安装说明.md)

## 环境要求

- macOS 12+
- Node.js 18+

## 快速开始（npm，发布后可用）

```bash
npm install -g ssh-toolbox
ssh-toolbox
```

或无需全局安装：`npx ssh-toolbox`

> 首次安装会下载 Electron（约 150MB+）。仅支持 macOS。

## 从源码运行

```bash
git clone https://github.com/langzf/ssh-toolbox.git
cd ssh-toolbox
npm install
npm start
```

## 开发运行

```bash
npm install
npm start
```

## 打包

```bash
npm run pack
# 输出: dist/mac-arm64/SSHToolbox.app
```

安装：将 `SSHToolbox.app` 拖入「应用程序」；首次请 **右键 → 打开**。

## 功能

- 保存服务器、密码（本机钥匙串加密）
- SSH 终端（xterm）
- SFTP：浏览、上传、下载、新建文件夹、删除
- **监控**：CPU、内存、磁盘、负载；NVIDIA GPU（需 `nvidia-smi`）
- 多主题、多标签会话
- **Agent 会话**：侧栏或 SSH 会话内 Agent 页，自然语言驱动 SSH/K8s 运维（需设置 Base URL、API Key、模型）；写/高危操作需确认
- **K8s**：导入 kubeconfig、浏览 Pod、日志、指标、确认后 exec/删 Pod

## Agent 设置

在应用设置 → Agent 中配置 OpenAI 兼容 **Base URL**、**API Key**（本机加密存储）、**Model** 与策略档位。远程通道（飞书/微信）为二期预留，当前使用桌面本地确认。

## 项目结构

```
main/     # Electron 主进程（SSH、SFTP、存储）
src/      # 界面与终端
scripts/  # 自检脚本
```
