# SSH 工具箱

macOS 桌面 SSH 客户端（Electron），支持多会话终端、SFTP 文件传输、保存主机与 Snippets。

## 环境要求

- macOS 12+
- Node.js 18+

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
- 多主题、多标签会话

## 项目结构

```
main/     # Electron 主进程（SSH、SFTP、存储）
src/      # 界面与终端
scripts/  # 自检脚本
```
