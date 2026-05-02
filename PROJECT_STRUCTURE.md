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
    │  1. 访问 mzycai.eu.cc（PHP 主机，产品主页）
    │  2. 点击「手机配对」→ mzycai.eu.cc/mobile.html
    │  3. 登录/注册（PHP MySQL，持久化）
    │  4. 查看在线设备列表
    │  5. 点击设备 → 跳转至 Render 完成 WebRTC 握手
    │  6. P2P 直连建立
    │
[PHP 主机]  mzycai.eu.cc
    ├── index.html         产品主页
    ├── mobile.html        登录/注册/设备列表页
    └── api/
        ├── auth.php       注册/登录（MySQL，持久化）
        ├── devices.php    设备注册/列表/心跳
        ├── signal.php     WebRTC 信令消息（Upstash Redis）
        ├── config.php     MySQL + JWT + Redis 配置
        ├── redis.php      Upstash Redis REST API 封装
        ├── jwt.php        JWT 签发/验证
        ├── db.php         PDO MySQL 连接 + 建表
        └── cors.php       CORS 头 + JSON 输出工具
    │
[Render 服务器]  cloudcli-server.onrender.com  (免费，每次部署重置 SQLite)
    ├── /mobile            配对页（public/mobile.html，HTTPS，支持 WebRTC）
    ├── /api/auth          账号登录（SQLite，临时）
    ├── /api/devices       设备列表（SQLite，临时）
    └── /ws/device         WebRTC 信令 WebSocket（设备注册/配对）
    │
[桌面端 Electron]  localhost:3001
    ├── 运行 React SPA（dist/index.html）
    ├── 注册到 Render 信令服务器（WebSocket）
    └── P2P 连接后，SW 代理手机端所有请求到本地
```

> **注意**：PHP 主机目前为 HTTP，WebRTC 需要 HTTPS 安全上下文。  
> 开启 SSL 后，mobile.html 可直接做 WebRTC，无需跳转 Render。

---

## PHP 后端 API 端点

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/auth.php?action=register` | POST | 注册（用户名/密码，返回 JWT）|
| `/api/auth.php?action=login` | POST | 登录（返回 JWT）|
| `/api/auth.php?action=me` | GET | 获取当前用户信息（需 JWT）|
| `/api/devices.php` | GET | 列出所有设备+在线状态（需 JWT）|
| `/api/devices.php` | POST | 注册/心跳设备（需 JWT）|
| `/api/devices.php?deviceId=xxx` | DELETE | 删除设备（需 JWT）|
| `/api/signal.php?action=send` | POST | 发送信令消息到目标设备（需 JWT）|
| `/api/signal.php?action=poll&deviceId=xxx` | GET | 取出本设备收件箱消息（需 JWT）|
| `/api/signal.php?action=heartbeat` | POST | 桌面端保持在线（每30s，需 JWT）|

---

## 关键数据流

| 场景 | 流程 |
|---|---|
| 手机配对（当前）| PHP 登录 → 设备列表 → 跳 Render → Render WebSocket 信令 → WebRTC P2P |
| 手机配对（SSL 后）| PHP 登录 → 设备列表 → PHP signal API → WebRTC P2P（无需 Render）|
| P2P 代理 | 手机 SW 拦截请求 → BroadcastChannel → mobile.html → WebRTC DataChannel → 桌面端 → 本地 HTTP → 响应原路返回 |
| PHP 认证 | bcrypt 存 MySQL `users.password_hash`，JWT HS256 签发，有效期 30 天 |
| 信令消息 | 存入 Upstash Redis 列表（120s TTL），LPUSH 入队，RPOP 出队 |
| 设备在线 | Redis key `device:{id}:online` 60s TTL，桌面端每 30s 心跳续期 |
