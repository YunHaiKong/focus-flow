# Focus Flow

AI 任务看板 + 悬浮球快捷入口 + 番茄专注计时器。

上传一张任务表格图片，或者输入「后天/10.16 我要干什么」，自动拆分任务、生成每日看板，并支持一键开始专注。

🔗 **在线体验**：https://yunhaikong.github.io/focus-flow

## 功能

| 模块 | 说明 |
|---|---|
| 📷 图片识别 | 使用 Tesseract.js 在浏览器端 OCR 识别任务表格，自动提取任务、天数、截止日期 |
| 💬 自然语言查询 | 支持「今天」「明天」「后天」「10.16」「本周计划」等查询 |
| 📋 任务看板 | 待办 / 进行中 / 已完成三列看板，支持拖拽切换状态 |
| 📅 日视图 | 点击日历条或输入日期，查看当天具体任务 |
| 🎱 悬浮球 | 右下角常驻，一键开始专注 / 今日任务 / 添加任务 |
| 🍅 专注计时 | 番茄钟（25/15/5 分钟），专注结束自动计入对应任务 |

## 快速开始

无需构建，直接用浏览器打开 `index.html` 即可。

```bash
git clone https://github.com/YunHaiKong/focus-flow.git
cd focus-flow
# 用任意静态服务器打开，例如：
python -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 使用示例

### 1. 图片识别

1. 点击「📷 图片识别」区域
2. 上传你的任务表格图片
3. 系统自动拆分任务到每一天

### 2. 自然语言查询

在「💬 自然语言」输入框中输入：

```
后天我要干什么
10.16我要干什么
本周计划
```

### 3. 专注计时

1. 点击右下角悬浮球 → 开始专注
2. 或点击日视图中任意任务的「专注」按钮
3. 番茄钟结束后，专注时长自动计入该任务

## 技术栈

- 原生 HTML / CSS / JavaScript
- [Tesseract.js](https://github.com/naptha/tesseract.js) 浏览器端 OCR
- LocalStorage 本地数据持久化
- GitHub Pages 部署

## 项目结构

```
focus-flow/
├── index.html      # 完整单页应用
├── README.md       # 项目说明
└── .github/
    └── workflows/
        └── pages.yml   # GitHub Pages 自动部署
```

## 数据说明

所有数据存储在浏览器 LocalStorage 中，不会上传到服务器。清除浏览器数据会丢失任务记录。

## 贡献

欢迎 Issue 和 PR。

## License

MIT
