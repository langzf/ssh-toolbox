# 通过 npm 安装 SSH 工具箱

适合 **macOS** 用户，无需克隆 Git 仓库，安装后即可启动桌面应用。

## 环境要求

- macOS 12+
- Node.js 18+（[nodejs.org](https://nodejs.org/) 或 `brew install node`）

## 安装与启动

### 方式一：全局安装（推荐）

```bash
npm install -g ssh-toolbox
ssh-toolbox
```

### 方式二：临时运行（不全局安装）

```bash
npx ssh-toolbox
```

首次执行 `npx` 时会自动下载包与 Electron，可能需要几分钟。

## 说明

| 项目 | 说明 |
|------|------|
| 安装体积 | 含 Electron 运行时，约 **150–250 MB**，属正常情况 |
| 系统 | 仅支持 **macOS**（`package.json` 中 `os: darwin`） |
| 数据目录 | `~/Library/Application Support/SSH 工具箱/` |
| 更新 | `npm update -g ssh-toolbox` 后重新运行 `ssh-toolbox` |

## 卸载

```bash
npm uninstall -g ssh-toolbox
```

本机连接数据仍在 Application Support 目录，需手动删除该文件夹才会清除。

## 与 .app 安装包的区别

| | npm 安装 | 打包 .app |
|---|----------|-----------|
| 安装 | `npm install -g` | 拖入「应用程序」 |
| 更新 | `npm update -g` | 重新下载 .app |
| 体积 | 含 node_modules + Electron | 单文件 .app |
| 适合 | 会装 Node 的开发者 | 不想装 Node 的最终用户 |

若对方电脑**没有 Node.js**，请仍使用 [本地部署手册](./本地部署手册.md) 中的 **打包 .app** 方式分享。

## 发布者：发布到 npm

```bash
cd /path/to/ssh-toolbox
npm login
npm publish
```

若包名 `ssh-toolbox` 已被占用，可在 `package.json` 改为 `@langzf/ssh-toolbox` 后执行：

```bash
npm publish --access public
```

用户安装：

```bash
npm install -g @langzf/ssh-toolbox
ssh-toolbox
```
