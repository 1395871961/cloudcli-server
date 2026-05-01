# Claude Code Remote — 项目规划文档

> 目标：将现有 Claude Code UI 改造为多租户移动端远程控制平台。
> 用户在手机浏览器控制自己电脑上运行的 Claude CLI，数据走 P2P 直连，服务器只负责认证与信令。

---

## 一、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        VPS 服务器                            │
│   用户认证 / 设备注册 / WebRTC 信令 / STUN（可选）            │
└────────────┬─────────────────────────┬───────────────────────┘
             │  WebSocket 心跳/信令     │  HTTP REST (Auth)
             │                         │
    ┌────────▼──────────┐     ┌────────▼──────────┐
    │   电脑端 Electron  │     │  手机端 浏览器/PWA  │
    │  后台常驻 + CLI    │◄───►│   发起控制请求      │
    │  本地 Node.js 服务 │     │   查看响应/终端     │
    └───────────────────┘     └───────────────────┘
              ▲ WebRTC DataChannel (P2P 加密直连)
              └──────────────────────────────────────┘
                     Claude 响应 / 终端输出 / 文件内容
                     （不经过 VPS，走用户自己的网络）
```

---

## 二、服务器端

### 定位
轻量中心节点，**不转发业务数据**，只做：账号管理、设备注册、WebRTC 信令撮合。

### 功能需求

#### 2.1 用户系统
- [ ] 用户注册（用户名 + 密码，bcrypt 加密）
- [ ] 用户登录，返回 JWT Access Token + Refresh Token
- [ ] Token 刷新接口
- [ ] 修改密码
- [ ] 注销账号

#### 2.2 设备管理
- [ ] 电脑端上线时向服务器注册（设备名、系统信息、当前 IP）
- [ ] 维护设备在线状态（WebSocket 心跳，30s 一次）
- [ ] 查询当前账号下所有已注册设备及在线状态
- [ ] 设备重命名
- [ ] 设备删除/注销

#### 2.3 WebRTC 信令
- [ ] 手机端请求连接指定设备（通过设备 ID）
- [ ] 服务器将连接请求转发给目标电脑端
- [ ] 转发 SDP Offer / SDP Answer / ICE Candidate
- [ ] 连接建立后退出信令通道（不再参与数据传输）

#### 2.4 STUN 服务（可选，部署在同一 VPS）
- [ ] 部署 coturn 或 pion/stun，供 WebRTC NAT 穿透使用
- [ ] 仅传地址信息，不转发媒体/数据流

#### 2.5 TURN 降级中继（可选）
- [ ] 当 P2P 穿透失败时（约 15-20% 概率），启用 TURN 中继
- [ ] 可接入 Cloudflare TURN（免费额度）减少自身带宽压力

### 技术方案
- **框架**：现有 Node.js + Express，增加信令模块
- **实时通信**：现有 WebSocket（ws 库）复用
- **数据库**：现有 SQLite（用户表 + 设备表）
- **部署**：PM2 进程守护，Nginx 反向代理，Let's Encrypt HTTPS

### API 新增接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/refresh` | 刷新Token |
| GET  | `/api/devices` | 获取我的设备列表 |
| DELETE | `/api/devices/:id` | 删除设备 |
| WS   | `/ws/signal` | WebRTC 信令通道 |
| WS   | `/ws/device` | 电脑端心跳注册通道 |

---

## 三、电脑端（Electron 桌面应用）

### 定位
将现有 Web 项目用 Electron 打包，后台常驻，作为 WebRTC 服务端（被连接方）。
支持平台：**Windows / macOS / Linux**（Electron 跨平台特性，同一套代码三端构建）。

### 功能需求

#### 3.1 平台支持
| 平台 | 安装包格式 | 开机自启方式 | 托盘支持 |
|------|-----------|------------|--------|
| Windows | `.exe` (NSIS 安装器) | 注册表 `HKCU\Run` | ✅ |
| macOS | `.dmg` | LaunchAgent plist | ✅ |
| Linux | `.AppImage` / `.deb` / `.rpm` | systemd user service / XDG autostart | ✅（部分桌面环境）|

> Linux 说明：AppImage 免安装，开箱即用；deb/rpm 适合 Ubuntu/Debian、Fedora/CentOS 用户；托盘在 GNOME 需安装 AppIndicator 扩展，KDE 原生支持。

#### 3.2 安装与初始化
- [ ] 安装向导：填写服务器地址、登录账号
- [ ] 首次运行自动注册设备（获取 Device ID 存本地）
- [ ] 设备命名（默认取电脑名称）

#### 3.3 后台常驻
- [ ] 开机自启（Windows 注册表 / macOS LaunchAgent / Linux XDG autostart + systemd）
- [ ] 系统托盘图标（显示连接状态：在线/有设备连接中）
- [ ] 托盘菜单：查看连接状态、断开所有连接、退出
- [ ] Linux 无桌面环境（纯 CLI 服务器）时：以 systemd 服务方式运行，无托盘，日志写入 journald

#### 3.4 与服务器保持心跳
- [ ] 启动后连接 `/ws/device`，保持 WebSocket 心跳
- [ ] 断线自动重连（指数退避，最长 30s 重试一次）
- [ ] 接收来自服务器的信令请求

#### 3.5 WebRTC 服务端
- [ ] 接收手机端的 SDP Offer，返回 SDP Answer
- [ ] ICE 候选交换（STUN 穿透）
- [ ] 建立 DataChannel，接受手机端的控制指令
- [ ] 将本地 Claude CLI 的输出通过 DataChannel 推送给手机

#### 3.6 本地服务
- [ ] 本地 Node.js 服务继续运行（现有功能保留）
- [ ] WebRTC DataChannel 作为数据通道替代 HTTP 转发
- [ ] 支持多路 DataChannel（聊天 / 终端 / 文件 分频道）

#### 3.7 安全
- [ ] 每次连接需要验证 JWT（手机端连接时携带）
- [ ] 可设置连接通知弹窗（某设备请求连接，允许/拒绝）
- [ ] 可选：PIN 码二次验证

### 技术方案
- **打包**：Electron（复用现有 Vite + React 前端）
- **WebRTC**：`node-webrtc` 或 `wrtc`（Node.js WebRTC 实现）
- **主进程**：Electron Main Process 管理心跳、WebRTC
- **渲染进程**：现有 Web UI（基本不改动）

---

## 四、手机端（浏览器 / PWA）

### 定位
纯 Web，无需安装原生 App，打开浏览器即用，可"添加到主屏幕"获得类 App 体验。

### 功能需求

#### 4.1 PWA 化（已有基础，需完善）
- [ ] `manifest.json`：App 名称、图标、主题色、启动屏
- [ ] Service Worker：离线缓存静态资源，断网友好提示
- [ ] 推送通知：Claude 任务完成时通知（现有 Web Push 基础）
- [ ] 添加到主屏幕引导提示

#### 4.2 移动端 UI 优化
- [ ] **底部导航栏**替代侧边栏（聊天 / 终端 / 文件 / 设置）
- [ ] 触控优化：所有交互元素 ≥ 44px，支持长按、滑动手势
- [ ] 软键盘适配：输入框获焦时页面不错位
- [ ] 横屏支持：终端/代码视图横屏展示更多内容
- [ ] 深色模式跟随系统

#### 4.3 设备选择页
- [ ] 登录后显示"我的设备"列表（在线/离线状态）
- [ ] 点击在线设备发起 WebRTC 连接
- [ ] 连接中状态展示（Loading + 取消按钮）
- [ ] 连接失败处理（穿透失败提示，自动尝试 TURN 中继）

#### 4.4 WebRTC 客户端
- [ ] 浏览器原生 WebRTC API（无需第三方库）
- [ ] 向服务器信令通道发送 SDP Offer
- [ ] 接收 SDP Answer + ICE Candidate
- [ ] DataChannel 建立后接管所有数据收发

#### 4.5 核心功能（复用现有组件）
- [ ] **聊天控制**：发送 Claude 指令，流式接收响应（DataChannel）
- [ ] **终端**：全功能远程终端，支持软键盘输入
- [ ] **文件管理**：浏览、查看、编辑电脑上的文件
- [ ] **Git**：查看 diff、提交记录（只读为主）
- [ ] **任务看板**：查看 TaskMaster 任务状态

#### 4.6 安全
- [ ] JWT 存储在 httpOnly Cookie 或 sessionStorage
- [ ] 连接前校验 Token 有效性
- [ ] 支持生物识别解锁（WebAuthn，可选）

---

## 五、本地端口预览（CLI 生成的网页）

### 场景描述
Claude CLI 执行 `npm run dev`、`python -m http.server`、`vite` 等命令时，会在电脑本地启动 Web 服务（如 `localhost:3000`）。用户需要在手机上安全预览这些页面。

### 核心原则
- **不暴露本地端口到公网**（安全第一）
- **复用已建立的 WebRTC P2P 通道**（无需额外连接）
- **手机端渲染完整网页**，包括静态资源、API 请求、WebSocket

---

### 实现方案：DataChannel HTTP 隧道 + Service Worker 代理

```
手机 iframe/内嵌浏览器
    ↓ 发出 HTTP 请求 (http://tunnel/3000/path)
Service Worker 拦截
    ↓ 序列化为消息，发入 DataChannel
电脑端 Electron 主进程
    ↓ 从本地 localhost:3000/path 取响应
    ↓ 序列化响应，经 DataChannel 返回
Service Worker 还原响应
    ↑ 渲染到 iframe
```

### 功能需求

#### 5.1 端口检测（电脑端）
- [ ] 监听 CLI 输出中的端口关键词（`localhost:XXXX`、`port XXXX`、`listening on`）
- [ ] 自动识别新开启的本地端口，推送通知给手机端："检测到新服务 :3000，是否预览？"
- [ ] 维护当前活跃端口列表（端口号、服务名称、开启时间）

#### 5.2 端口白名单与安全控制（电脑端）
- [ ] 每次新端口首次被请求时弹窗确认（允许 / 拒绝 / 永久允许）
- [ ] 可配置白名单端口范围（如 3000-9999）
- [ ] 禁止转发系统敏感端口（22、80、443、数据库端口等）
- [ ] 仅接受来自已认证 P2P 连接的请求，外部无法访问

#### 5.3 DataChannel HTTP 代理（电脑端）
- [ ] 独立 DataChannel 频道：`port-proxy`
- [ ] 接收手机端的 HTTP 请求（方法、路径、Headers、Body）
- [ ] 用 Node.js `http` 模块在本地发起请求至 `localhost:PORT`
- [ ] 将响应（状态码、Headers、Body）序列化后回传
- [ ] 支持大响应体分片传输（每片 64KB）
- [ ] 支持 WebSocket 升级请求（通过 DataChannel 模拟双向流）

#### 5.4 Service Worker 代理（手机端）
- [ ] 注册 Service Worker，拦截 `http://tunnel/{port}/` 前缀的请求
- [ ] 将请求序列化，通过 DataChannel 发送给电脑端
- [ ] 等待响应后还原为标准 Response 对象返回给浏览器
- [ ] 处理相对路径资源（CSS/JS/图片自动补全 tunnel 前缀）

#### 5.5 预览 UI（手机端）
- [ ] 底部导航新增"预览"Tab，列出电脑当前所有活跃端口
- [ ] 点击端口进入内嵌 WebView/iframe 预览页面
- [ ] 顶部工具栏：端口号、刷新、在系统浏览器中打开（仅调试用）、关闭
- [ ] 横屏模式优先（更大的预览空间）

### 技术参考
> 此方案与 **VS Code Remote Port Forwarding**、**GitHub Codespaces** 的端口转发原理完全相同，是业界成熟方案。

### 限制说明
| 情况 | 处理方式 |
|------|---------|
| 目标服务使用 WebSocket | 通过 DataChannel 模拟，支持但有延迟 |
| 页面包含大量静态资源 | 并发多个 DataChannel 请求，或串行队列 |
| 目标服务有 CORS 限制 | 电脑端代理层自动注入 CORS 头 |
| 目标服务需要 Cookie | DataChannel 层透传 Cookie，Service Worker 注入 |
| 电脑端服务已关闭 | 返回友好错误页，提示服务已停止 |

---

## 六、Claude CLI Skill 集成

### 设计思路

Claude CLI 支持在 `.claude/commands/` 目录下定义自定义 Skill（Markdown 文件），用 `/skill名称` 在对话中触发。  
将本项目的部分**工作流操作**封装为 Skill，让 Claude 在编写代码的同时可以直接调用远程控制相关功能，实现"边开发边推送、边运行边预览"的流畅体验。

```
用户在手机端对话框输入 /preview-port 3000
    ↓ Claude 读取 Skill 指令
    ↓ 调用本项目 API 注册端口预览
    ↓ 返回预览链接，手机内嵌显示
```

---

### Skill 清单

#### `/remote-status`
**用途**：查询当前已连接的移动设备列表及连接质量  
**触发场景**：Claude 完成一个任务后，想确认是否有手机在线接收结果  
**执行内容**：
- 调用本地 API `GET /api/devices/connected`
- 显示在线设备列表、连接时长、P2P 延迟
- 若无设备在线，提示用户打开手机端

---

#### `/preview-port [端口号]`
**用途**：将指定本地端口注册为手机可预览的服务  
**触发场景**：Claude 运行 `npm run dev` 后，用户想在手机上预览效果  
**执行内容**：
- 检测目标端口是否有服务在监听
- 调用本地 API `POST /api/port-proxy/register { port }`
- 向已连接手机推送通知："新预览服务已就绪 :PORT，点击查看"
- 返回内嵌预览的 tunnel 地址

---

#### `/push-notify [消息]`
**用途**：向所有已连接手机发送一条推送通知  
**触发场景**：Claude 完成长时间任务（构建、测试、部署）后主动通知用户  
**执行内容**：
- 调用本地 API `POST /api/notify { message, level }`
- 通过 DataChannel 推送给所有在线设备
- 离线设备通过 Web Push 推送

---

#### `/task-sync`
**用途**：将 TaskMaster 当前任务状态同步推送到手机端  
**触发场景**：Claude 更新了任务状态（完成/新增子任务）后刷新手机视图  
**执行内容**：
- 读取 `.taskmaster/tasks/tasks.json`
- 通过 DataChannel 推送增量更新
- 手机端任务看板实时刷新，无需手动刷新

---

#### `/device-pair`
**用途**：生成一次性设备配对码，供新手机快速绑定账号  
**触发场景**：用户换手机或首次使用，避免手动输入服务器地址和账号  
**执行内容**：
- 调用服务器 API 生成 6 位数字配对码（有效期 5 分钟）
- 同时生成可扫描的 QR 码（包含服务器地址 + 一次性 Token）
- 在终端打印 QR 码，手机扫码后自动登录并绑定设备

---

#### `/screenshot`
**用途**：截取电脑当前屏幕并推送到手机查看  
**触发场景**：Claude 打开了某个 GUI 应用或浏览器，用户想在手机上确认视觉效果  
**执行内容**：
- 调用系统截图 API（Electron `desktopCapturer`）
- 压缩为 JPEG 后通过 DataChannel 传输
- 手机端弹出图片预览

---

### Skill 文件结构

```
.claude/
└── commands/
    ├── remote-status.md     # /remote-status
    ├── preview-port.md      # /preview-port
    ├── push-notify.md       # /push-notify
    ├── task-sync.md         # /task-sync
    ├── device-pair.md       # /device-pair
    └── screenshot.md        # /screenshot
```

每个 Skill 文件内容示例（`preview-port.md`）：

```markdown
---
description: 将本地端口注册为手机可预览的服务
---

检查端口 $ARGUMENTS 是否有 HTTP 服务在监听。
如果有，调用 POST http://localhost:3001/api/port-proxy/register
请求体: { "port": $ARGUMENTS }
然后告诉用户手机端预览已就绪，并显示返回的 tunnel 地址。
如果端口无服务，提示用户先启动对应服务。
```

### 与项目的协作关系

| Skill | 依赖的项目能力 | 数据流向 |
|-------|-------------|---------|
| `/remote-status` | 设备注册 API | 查询 → 展示 |
| `/preview-port` | DataChannel 端口代理 | 注册 → 手机推送 |
| `/push-notify` | WebRTC DataChannel + Web Push | 电脑 → 手机 |
| `/task-sync` | TaskMaster 文件 + DataChannel | 电脑 → 手机 |
| `/device-pair` | 服务器配对 API + QR 生成 | 服务器 → 终端 |
| `/screenshot` | Electron desktopCapturer | 电脑 → 手机 |

---

## 七、开发阶段规划

### 阶段一：基础设施（2-3周）
1. 服务器加设备注册 + 心跳 WebSocket
2. 服务器 WebRTC 信令转发模块
3. 数据库新增设备表

### 阶段二：电脑端（3-4周）
1. Electron 打包现有项目，验证可运行
2. 主进程实现心跳注册
3. 集成 node-webrtc，实现 DataChannel
4. 开机自启 + 托盘图标

### 阶段三：手机端（2-3周）
1. PWA manifest + Service Worker
2. 移动端 UI 改版（底部导航）
3. 设备选择页
4. 浏览器 WebRTC 客户端实现

### 阶段四：联调与优化（2周）
1. 端到端连接测试（不同网络环境）
2. TURN 降级测试
3. 性能优化（DataChannel 分片传输大文件）
4. 安全审计

---

## 六、技术依赖清单

### 新增依赖

| 端 | 依赖 | 用途 |
|----|------|------|
| 服务器 | 无新增 | 复用现有 ws |
| 电脑端 | `electron` | 桌面打包（Win/macOS/Linux 三端） |
| 电脑端 | `electron-builder` | 安装包生成（exe/dmg/AppImage/deb/rpm）|
| 电脑端 | `node-webrtc` / `wrtc` | Node.js WebRTC |
| 电脑端 | `electron-store` | 本地配置持久化 |
| 电脑端(Linux) | `libappindicator` | Linux 系统托盘支持（部分发行版需额外安装）|
| 手机端 | 无新增 | 浏览器原生 WebRTC |

### 基础设施
| 服务 | 用途 | 费用 |
|------|------|------|
| VPS（现有） | 信令服务器 + Auth | 已有 |
| Let's Encrypt | HTTPS 证书 | 免费 |
| Cloudflare | DNS + CDN + TURN | 免费套餐 |
| coturn（可选） | 自建 STUN/TURN | 免费（VPS 上运行）|

---

## 七、风险与应对

| 风险 | 概率 | 应对方案 |
|------|------|---------|
| NAT 穿透失败 | ~20% | 自动降级 TURN 中继 |
| node-webrtc 平台兼容性 | 中 | 备选：本地 HTTP + SSH 隧道方案 |
| 电脑端长时间断连 | 低 | 指数退避重连 + 托盘通知 |
| DataChannel 大文件传输 | 中 | 分片 + 流控（16KB/chunk）|
| 多用户并发信令 | 低 | 服务器信令无状态，水平扩展容易 |
