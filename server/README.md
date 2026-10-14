# Focus Flow ☁️ 云端同步中枢服务 (Cloud Sync Hub)

本服务为 Focus Flow 提供**桌面悬浮球（Electron）、移动端（PWA / 小程序）和 Web 在线版**之间的毫秒级跨端数据与番茄钟同步。

---

## 🌟 核心特性

- **跨端双向秒级实时推送**：基于 WebSocket 全双工通信，任意端修改任务或开始专注，其余端即时同步。
- **免账号房间密钥机制 (Sync Key)**：生成唯一配对码（如 `ff_x89a`），三端输入相同密钥自动配对。
- **离线优先 (Offline-First)**：本地可脱机运行，网络恢复后基于时间戳（LWW）增量合并。
- **极简部署**：零外部数据库依赖（内置轻量文件存储），单文件即可运行；同时也提供 Supabase SQL 模式。

---

## 🚀 方式一：Node.js 极速部署（推荐）

### 1. 本地启动运行
```bash
cd server
npm install
npm start
```
默认服务将运行在 `http://localhost:23120`。

### 2. Docker 一键部署
```bash
cd server
docker build -t focus-flow-server .
docker run -d -p 23120:23120 -v focus-flow-data:/app/data --name focus-flow-server focus-flow-server
```

### 3. 一键部署到免费云平台 (Railway / Render / Zeabur)
1. Fork 本仓库或上传至 GitHub。
2. 在 [Railway.app](https://railway.app/) 或 [Render.com](https://render.com/) 新建 Web Service，指向 `server` 目录。
3. 部署成功后即可获得公网 HTTPS 域名，如 `https://your-focus-flow.up.railway.app`。

---

## ⚡ 方式二：完全免服务器架构 (Supabase)

若不想维护任何云服务器，可直接使用 **Supabase 免费托管**：
1. 前往 [Supabase 官网](https://supabase.com/) 创建免费项目。
2. 打开 **SQL Editor**，执行本目录下的 `supabase-schema.sql`。
3. 获取 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 填入 Focus Flow 客户端即可。

---

## 📡 API 与协议规范

### 1. 健康检查
`GET /health`
```json
{ "status": "ok", "service": "focus-flow-cloud-sync", "version": "1.0.0" }
```

### 2. 增量拉取
`GET /api/pull?key=<SYNC_KEY>&since=<TIMESTAMP>`

### 3. 提交变更并拉取增量
`POST /api/sync`
```json
{
  "key": "ff_my_secret_key",
  "deviceId": "desktop-pc",
  "lastSyncAt": 1728980000000,
  "mutations": {
    "tasks": [
      {
        "id": "t1728987123",
        "title": "测试跨端同步",
        "date": "2026-10-15",
        "status": "todo",
        "updatedAt": 1728989000000,
        "deleted": false
      }
    ],
    "focusState": {
      "status": "running",
      "endsAt": 1728990500000,
      "remaining": 1500,
      "updatedAt": 1728989000000
    }
  }
}
```

### 4. WebSocket 实时全双工频道
- 地址：`ws://your-host:23120/ws?key=<SYNC_KEY>&deviceId=<DEVICE_ID>`
- 支持事件：`INIT_SNAPSHOT`, `TASK_MUTATION`, `FOCUS_CHANGE`, `PING/PONG`
