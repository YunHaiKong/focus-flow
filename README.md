# Focus Flow

**AI 任务中枢 + 桌面悬浮球 + 番茄专注计时器。**

跟任意 AI 对话（WorkBuddy、网页版 ChatGPT、任何有终端或剪贴板权限的 Agent），它就能把任务自动填进你的悬浮球。鼠标往球上一停，今日待办和番茄钟直接显示。

> 本仓库包含两部分：
> - `desktop/` —— **Electron 桌面版**（主力形态，悬浮球常驻桌面）
> - `web/` —— 浏览器版（轻量体验，GitHub Pages 在线可用）

## 桌面版（desktop/）

### 核心能力

| 模块 | 说明 |
|---|---|
| 🎱 悬浮球 | 无边框、置顶、可拖动、位置记忆。空闲时显示今日待办数，专注中直接在球面显示倒计时 |
| 🖱️ 双模式展开 | 悬停 0.8 秒自动弹出面板；点击立即展开；移开自动收起；双击球直接开始/暂停专注 |
| 📋 待办 | 今日任务列表、勾选完成、手动添加（支持「后天 / 10.16 / 明天3点 / 周三」） |
| 🍅 番茄专注 | 25/15/5 分钟三档，可关联任务，专注分钟数自动累计 |
| 🤖 内置 AI | 面板里的对话框，说出你的计划自动提取任务（需配置 OpenAI 兼容 API Key） |
| 🔔 系统通知 | 任务添加、专注结束桌面通知；开机自启可选 |

### 任意 AI 写入（四通道）

这是「不管哪个 AI 都能填」的关键。软件常驻后提供四条写入路径：

| 通道 | 用法 | 适合谁 |
|---|---|---|
| **本地 HTTP API** | `POST http://127.0.0.1:23119/api/tasks` | WorkBuddy / 任何能跑命令的 Agent |
| **inbox 文件** | 往 `~/.focus-flow/inbox.txt` 写一行任务文本 | 任何能写文件的 AI 或脚本 |
| **剪贴板标记** | 复制以 `#task` 开头的文本，2 秒内自动入库 | 网页版 ChatGPT 等纯对话 AI |
| **内置 AI 对话** | 悬浮球面板「AI」标签页 | 你自己 |

### HTTP API 一览

```bash
# 健康检查
curl http://127.0.0.1:23119/health

# 添加任务（自然语言，自动解析日期）
curl -X POST http://127.0.0.1:23119/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"text":"后天下午3点交报告"}'

# 查询某天任务（回答「后天/10.16我要干什么」）
curl "http://127.0.0.1:23119/api/today?date=10.16"

# 完成任务
curl -X POST http://127.0.0.1:23119/api/complete \
  -H "Content-Type: application/json" \
  -d '{"id":"t1697..."}'

# 开始 / 停止专注
curl -X POST http://127.0.0.1:23119/api/focus/start -d '{"minutes":25}'
curl -X POST http://127.0.0.1:23119/api/focus/stop
```

### 运行

```bash
cd desktop
npm install
npm start          # 开发运行
npm run dist       # 打包 Windows portable / 安装包（输出在 release/）
```

依赖：Node.js 18+，Windows 10+（macOS/Linux 理论可用，未测）。

### 数据与隐私

所有数据存在本地 `~/.focus-flow/`（tasks.json / config.json / inbox.txt），不联网、不上传。内置 AI 对话需要你自己填 API Key，请求直连你配置的服务商。

## 浏览器版（web/）

零依赖单文件应用：图片 OCR（Tesseract.js）、自然语言查询、看板、页内番茄钟。

🔗 在线体验：https://yunhaikong.github.io/focus-flow/

## WorkBuddy 联动

安装 `focus-flow-bridge` skill 后，在 WorkBuddy 对话里直接说：

> 「把后天下午交报告加到悬浮球」
> 「10.16 我要干什么？」
> 「开始专注 25 分钟」

WorkBuddy 会自动调用本地 HTTP API 完成操作。

## License

MIT
