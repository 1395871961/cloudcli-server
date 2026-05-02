# 项目目录结构

## 概览

CloudCLI 是一个本地 AI 编程助手，支持 Claude / Codex / Cursor / Gemini 等多个 AI 提供商，通过 WebRTC P2P 实现手机远程操控桌面。

```
claudecodeui-main/
├── 核心配置
├── server/          # 本地 Node.js 服务端（桌面端运行）
├── dist-server/     # 服务端编译产物（Render 实际运行）
├── public/          # 静态资源 + 手机配对页
├── src/             # React 前端源码（gitignore，不推送 Render）
├── dist/            # React 前端编译产物（gitignore，不推送 Render）
├── electron/        # Electron 桌面端（gitignore，不推送 Render）
└── shared/          # 前后端共用工具
```

---

## 根目录

| 文件/目录 | 说明 |
|---|---|
| `server/` | 本地服务端源码 |
| `dist-server/` | 服务端编译产物，Render 部署用 |
| `public/` | 静态资源，含手机配对页 `mobile.html` |
| `src/` | React 前端源码（本地构建用，不上传 Render）|
| `dist/` | React 前端编译产物（本地运行用，不上传 Render）|
| `electron/` | Electron 主进程代码（不上传 Render）|
| `shared/` | 前后端共用工具（网络、类型等）|
| `render.yaml` | Render 部署配置 |
| `electron-builder.yml` | Electron 打包配置 |
| `vite.config.js` | Vite 前端构建配置 |
| `package.json` | 项目依赖与脚本 |
| `.gitignore` | 排除 `electron/` `src/` `dist/`（不推送 Render）|

---

## server/ — 本地服务端源码

```
server/
├── index.js              # Express 主入口，路由挂载、静态文件、WebSocket
├── database/
│   ├── db.js             # SQLite 数据库操作（用户、设备、API Key 等）
│   └── schema.js         # 数据库建表 & 迁移
├── routes/               # API 路由
│   ├── auth.js           # 注册 / 登录（bcrypt 哈希，JWT 签发）
│   ├── devices.js        # 设备列表管理
│   ├── agent.js          # AI Agent 执行路由
│   ├── git.js            # Git 操作路由
│   ├── projects.js       # 项目 / Session 管理
│   ├── settings.js       # 用户设置
│   ├── commands.js       # 终端命令执行
│   ├── messages.js       # 消息记录
│   ├── plugins.js        # 插件管理
│   ├── remote.js         # P2P 远程命令中继（手机→桌面）
│   ├── user.js           # 用户信息
│   ├── taskmaster.js     # Taskmaster AI 任务规划
│   ├── cursor.js         # Cursor 集成
│   ├── gemini.js         # Gemini 集成
│   └── codex.js          # OpenAI Codex 集成
├── modules/
│   ├── signal.js         # WebSocket 信令服务（设备注册、P2P 协商）
│   └── providers/        # AI 提供商适配层（Claude/Codex/Cursor/Gemini）
├── middleware/
│   └── auth.js           # JWT 验证中间件
├── services/
│   └── vapid-keys.js     # Web Push 推送服务
├── constants/
│   └── config.js         # 常量配置
├── claude-sdk.js         # Claude SDK 封装
├── openai-codex.js       # OpenAI Codex SDK 封装
├── cursor-cli.js         # Cursor CLI 封装
├── gemini-cli.js         # Gemini CLI 封装
├── cli.js                # Claude CLI 封装
├── projects.js           # 项目文件系统操作
└── sessionManager.js     # Session 生命周期管理
```

---

## dist-server/ — Render 部署用编译产物

与 `server/` 目录结构相同，是 TypeScript 编译后的 JS 版本。  
**Render 实际运行：`node dist-server/server/index.js`**

> ⚠️ 修改服务端逻辑时，需同步修改 `server/` 和 `dist-server/` 两处。

---

## public/ — 静态资源

```
public/
├── mobile.html     # 手机配对页（登录 + 设备列表 + WebRTC P2P 连接）
├── sw.js           # Service Worker（P2P 激活时代理所有请求到桌面端）
├── manifest.json   # PWA 清单
├── favicon.png/svg # 图标
├── logo-*.png      # 各尺寸 Logo
└── icons/          # PWA 图标集
```

---

## electron/ — 桌面端（不推送 Render）

```
electron/
├── main.cjs        # Electron 主进程（启动本地服务器、系统托盘、WebRTC）
├── preload.cjs     # 预加载脚本（暴露 IPC API 给渲染进程）
├── webrtc.cjs      # WebRTC 信令客户端（连接 Render 信令服务器）
└── store.cjs       # electron-store 持久化配置
```

---

## src/ — React 前端源码（不推送 Render）

```
src/
├── components/
│   ├── auth/       # 登录 / 认证上下文（AuthContext）
│   ├── settings/   # 设置面板（设备、连接模式等）
│   ├── connection/ # 连接模式切换（Online / LAN / Offline）
│   └── ...         # 其他 UI 组件
└── ...
```

---

## 部署架构

```
[手机浏览器]
    │  打开 cloudcli-server.onrender.com
    │  → 重定向到 /mobile
    │  → 登录（与桌面端相同账密）
    │  → 看到设备列表
    │  → 点击连接 → WebRTC P2P
    │
[Render 服务器]  cloudcli-server.onrender.com
    ├── 提供 /mobile 配对页（public/mobile.html）
    ├── /api/auth  账号登录（SQLite，每次部署重置）
    ├── /api/devices  设备列表
    └── /ws/device  WebRTC 信令（设备注册/配对）
    │
[桌面端 Electron]  localhost:3001
    ├── 运行 React SPA（dist/index.html）
    ├── 注册到 Render 信令服务器
    └── P2P 连接后，SW 代理手机端所有请求到本地
```

---

## 关键数据流

| 场景 | 流程 |
|---|---|
| 手机配对 | 手机登录 → 获取 JWT → 拉取设备列表 → WebRTC Offer/Answer → P2P 建立 |
| P2P 代理 | 手机 SW 拦截请求 → BroadcastChannel → mobile.html → WebRTC DataChannel → 桌面端 → 本地 HTTP → 响应原路返回 |
| 认证 | bcrypt hash 存 SQLite `users.password_hash`，JWT 有效期验证 |
| 信令 token | 桌面端登录时请求 Render `/api/auth/login` 获取 JWT，存入 electron-store `signalingToken` |
