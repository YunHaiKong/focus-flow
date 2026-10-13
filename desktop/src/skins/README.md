# 悬浮球皮肤

## 目录结构

```
skins/
├── README.md                          ← 本文件
├── Elysia-Herrscher-of-Human.zip      ← 原始皮肤包（完整，含指针+表情）
└── elysia-full/                       ← 解压后的完整内容
    ├── The mouse pointer/             ← Windows 鼠标指针皮肤（16 个 .ani + 安装.inf）
    └── 表情/                          ← 像素表情 GIF（已用于悬浮球，见 ../sprites/）
```

## Elysia · Herrscher of Human

- 来源：社区制作的 Elysia（爱莉希雅）主题指针+表情包
- **表情部分**已提取到 `../sprites/` 并重命名为 ASCII 安全文件名，作为悬浮球默认皮肤：
  - `idle1.gif` / `idle2.gif`（待机1/待机2）— 空闲循环
  - `wink.gif` — 鼠标悬停
  - `realm.gif`（真我之境）— 专注中
  - `clap.gif`（鼓掌）— 今日任务全部完成
  - 其余表情（爱心/气鼓鼓/捧花/喇叭/笑/问号/爱门）备用，可在 `ball.html` 顶部的 `SPRITE` 映射中换用
- **指针部分**（`The mouse pointer/*.ani`）是 Windows 系统指针皮肤，与本软件无关；
  想全局换鼠标的话，右键 `Right-click to install.inf` → 安装，再到
  设置 → 蓝牙和其他设备 → 鼠标 → 其他鼠标设置 → 指针 里选择方案。

## 如何添加自己的皮肤

1. 准备一组 GIF（推荐每帧透明背景，尺寸 50-120px）
2. 在 `desktop/src/sprites/` 旁新建目录，如 `desktop/src/skins/my-skin/`
3. 在 `ball.html` 顶部 `SPRITE` 对象里把对应状态指到新文件
4. 重启应用即可生效

> 版权提示：Elysia 角色版权归 miHoYo 所有，此皮肤包为粉丝制作，
> 仓库内仅作学习演示用途。
