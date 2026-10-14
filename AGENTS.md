# AI Agent Guidelines for Focus Flow

Focus Flow provides a seamless desktop floating ball, task manager, and pomodoro timer for developers. All AI agents (Antigravity, Claude Code, Cursor, Windsurf, OpenAI Codex, WorkBuddy, etc.) can programmatically inspect and control the user's tasks, schedule, and focus sessions via standardized interfaces.

---

## ⚡ Unified CLI Interface

Run commands using Node.js from the repository root:

```bash
# 1. Connection check
node .agents/skills/focus-flow/scripts/focus-flow.js status

# 2. Add task with natural language date/time parsing
node .agents/skills/focus-flow/scripts/focus-flow.js add "<task text with relative or absolute date/time>"
# Example: node .agents/skills/focus-flow/scripts/focus-flow.js add "明天下午3点评审代码PR"

# 3. List today's tasks
node .agents/skills/focus-flow/scripts/focus-flow.js list

# 4. List tasks for a specific date (e.g., "明天", "后天", "2026-10-16", "周五")
node .agents/skills/focus-flow/scripts/focus-flow.js list "<date_string>"

# 5. Mark task as completed
node .agents/skills/focus-flow/scripts/focus-flow.js done <task_id>

# 6. Delete a task
node .agents/skills/focus-flow/scripts/focus-flow.js del <task_id>

# 7. Start pomodoro timer (minutes optional, defaults to 25)
node .agents/skills/focus-flow/scripts/focus-flow.js focus [minutes] [task_id]

# 8. Pause / Stop pomodoro
node .agents/skills/focus-flow/scripts/focus-flow.js pause
node .agents/skills/focus-flow/scripts/focus-flow.js stop
```

---

## 📴 Offline Fallback Guarantee

If the desktop application is currently closed, running `node .../focus-flow.js add "..."` automatically falls back to appending the task line to `~/.focus-flow/inbox.txt`.  
When the user launches Focus Flow later, the app will automatically ingest and parse all pending items from `inbox.txt` into the database on startup.

---

## 🌐 Local HTTP REST API (Port 23119)

When the desktop app is running, it hosts an HTTP service at `http://127.0.0.1:23119`:

- `GET /health` — Check if desktop ball is online
- `POST /api/tasks` — Body: `{"text": "..."}` — Add task
- `GET /api/today` — Optional query: `?date=YYYY-MM-DD` — List tasks
- `POST /api/complete` — Body: `{"id": "..."}` — Mark task done
- `POST /api/delete` — Body: `{"id": "..."}` — Delete task
- `POST /api/focus/start` — Body: `{"minutes": 25, "taskId": "..."}` — Start timer
- `POST /api/focus/pause` — Pause timer
- `POST /api/focus/stop` — Stop timer

---

## 📋 Clipboard Sniffing Channel

If an agent does not have command execution permissions (e.g. browser chat interface), the user can copy text starting with `#task ` (e.g. `#task 检查线上日志`), and Focus Flow will detect it in the system clipboard within 2 seconds and add it to today's list.

---

## ☁️ Cloud Sync Server (Port 23120)

Focus Flow includes a dedicated real-time synchronization hub for Desktop, Mobile (PWA), and Web:
- Start server: `cd server && npm start`
- REST Sync API: `POST http://localhost:23120/api/sync`
- WebSocket Realtime: `ws://localhost:23120/ws?key=<syncKey>&deviceId=<id>`
- Supabase alternative: execute `server/supabase-schema.sql` for serverless cloud sync.

