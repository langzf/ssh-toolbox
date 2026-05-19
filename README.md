# SSH 工具箱（Windows）

Windows 桌面 SSH 客户端（Electron），支持多会话终端、SFTP 文件传输、保存主机与 Snippets。

📖 **从 Git 克隆并本地部署的完整步骤** → [docs/Windows本地部署手册.md](docs/Windows本地部署手册.md)

## 环境要求

- Windows 10 或 Windows 11（64 位）
- Node.js 18+

## 快速开始

```powershell
git clone --branch windows --single-branch https://github.com/langzf/ssh-toolbox.git ssh-toolbox-windows
cd ssh-toolbox-windows
npm install
npm start
```

> 仓库地址：https://github.com/langzf/ssh-toolbox/tree/windows  
> 若已单独创建 `ssh-toolbox-windows` 仓库，可将 `origin` 改为该地址后 `git push`。

也可双击或在命令提示符中运行项目根目录的 `start.bat`。

## 开发运行

```powershell
npm install
npm start
```

若在 Cursor / VS Code 内置终端中启动失败，请先清除 `ELECTRON_RUN_AS_NODE` 环境变量，或使用 `start.bat`。

## 打包

```powershell
npm run pack
# 输出: dist/SSH 工具箱 Setup x.x.x.exe（NSIS 安装包）
```

仅生成未安装目录（便于调试）：

```powershell
npm run pack:dir
# 输出: dist/win-unpacked/SSHToolbox.exe
```

## 功能

- 保存服务器、密码（Windows 凭据加密 / DPAPI）
- SSH 终端（xterm）
- SFTP：浏览、上传、下载、新建文件夹、删除
- 多主题、多标签会话

## 项目结构

```
main/     # Electron 主进程（SSH、SFTP、存储）
src/      # 界面与终端
scripts/  # 自检脚本
```
