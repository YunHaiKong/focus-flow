---
name: focus-flow
description: >-
  操纵与管理 Focus Flow 桌面悬浮球与番茄钟：添加/查询日程任务、完成待办、启动/暂停/停止专注计时。
  当用户提到「添加到悬浮球」、「今日待办」、「开始专注」、「查看任务」等意图时使用。
---

# Focus Flow Skill

用于与本地运行的 **Focus Flow** 桌面悬浮球待办与番茄钟进行联动交互。

## 适用场景
- 用户要求添加日程、提醒、待办到桌面悬浮球（如：「后天下午3点开会加到悬浮球」）
- 用户查询某天待办或今日安排（如：「今天我要干什么？」、「明天有什么任务？」）
- 用户要求启动、暂停或停止桌面番茄钟（如：「开始专注 25 分钟」、「暂停专注」）
- 用户标记完成某项待办

## 快速调用方式

优先使用工作区内置的轻量 CLI 脚本执行操作：

```bash
# 1. 检查悬浮球连接状态
node .agents/skills/focus-flow/scripts/focus-flow.js status

# 2. 添加自然语言任务（自动识别明天、后天、周三、下午3点等）
node .agents/skills/focus-flow/scripts/focus-flow.js add "明天下午3点半提交项目周报"

# 3. 查看今日待办
node .agents/skills/focus-flow/scripts/focus-flow.js list

# 4. 查看指定日期待办
node .agents/skills/focus-flow/scripts/focus-flow.js list "明天"

# 5. 完成任务
node .agents/skills/focus-flow/scripts/focus-flow.js done <task_id>

# 6. 删除任务
node .agents/skills/focus-flow/scripts/focus-flow.js del <task_id>

# 7. 控制番茄专注
node .agents/skills/focus-flow/scripts/focus-flow.js focus 25
node .agents/skills/focus-flow/scripts/focus-flow.js pause
node .agents/skills/focus-flow/scripts/focus-flow.js stop
```

## 底层通讯通道与 Fallback 原理

1. **HTTP API（主力）**：
   - 目标：`http://127.0.0.1:23119`
   - 提供健康检查、实时添加、查询与专注计时。
2. **Inbox 文件写入（离线容错）**：
   - 路径：`~/.focus-flow/inbox.txt`
   - 若桌面客户端未运行，CLI 会自动降级写入 `inbox.txt`，客户端下次启动时自动入库。
