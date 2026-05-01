# Backend Deployment

## 目录结构

```
project-root/
  src/          ← 前端客户端代码
  server/       ← 后端服务器源码
  dist-server/  ← 编译产物（自动生成，已提交至 Git）
  DEPLOY.md     ← 本文件
```

---

## 线上服务地址

| 项目 | URL |
|---|---|
| **后端 API** | `https://cloudcli-server.onrender.com` |
| 健康检查 | `https://cloudcli-server.onrender.com/health` |

---

## 托管平台：Render（免费tier）

- 平台：[Render](https://render.com)
- 运行时：Node.js native（非 Docker）
- 仓库：`https://github.com/1395871961/cloudcli-server`
- 服务 ID：`srv-d7q62ptckfvc739jb29g`
- Node 版本：v22（由 `.nvmrc` 指定）

---

## 构建与启动配置

| 配置项 | 值 |
|---|---|
| **Build Command** | `npm install --omit=dev --ignore-scripts && npm rebuild better-sqlite3` |
| **Start Command** | `node dist-server/server/index.js` |

### 环境变量（Render Dashboard → Environment）

| 变量名 | 值 | 说明 |
|---|---|---|
| `NODE_ENV` | `production` | 生产模式 |
| `SERVER_PORT` | `3001` | 本地备用端口 |
| `HOST` | `0.0.0.0` | 监听所有网卡 |
| `DATABASE_PATH` | `/tmp/cloudcli/auth.db` | SQLite 数据库路径 |

> Render 会自动注入 `PORT=10000`，服务器优先读取 `PORT` 环境变量。

---

## 重新部署

推送代码到 GitHub 后 Render 会**自动触发部署**：

```bash
git add -A
git commit -m "your message"
git push
```

也可在 Render Dashboard 手动点击 **"Deploy latest commit"**。

---

## 本地构建服务器

```bash
# 编译服务器（生成 dist-server/，并自动修复路径别名）
npm run build:server

# 本地运行编译产物（需先设置环境变量）
DATABASE_PATH=./auth.db node dist-server/server/index.js

# 开发模式（tsx 直接运行，无需编译）
npm run server:dev
```

---

## 注意事项

- **数据库**：使用 `better-sqlite3`（原生模块，Render 上需 `npm rebuild`）。`/tmp` 路径在每次 Render 重启后会清空（用户数据会丢失），如需持久化请挂载 Render Disk。
- **路径别名**：构建脚本（`scripts/fix-path-aliases.cjs`）会自动将编译产物中的 `@/` 别名替换为正确相对路径，无需手动处理。
- **node-pty**：列在 `optionalDependencies`，在 Render 上不可用时会静默跳过（终端会话功能在 Render 上不可用）。
- **自动保活**：服务器每 14 分钟自 ping `/health`，防止 Render 免费 tier 休眠。
