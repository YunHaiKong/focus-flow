# Focus Flow Integration for Claude

You can directly manage and interact with the user's desktop floating ball and pomodoro timer:

## Available CLI Commands
Run with node:
- Check connection status: `node .agents/skills/focus-flow/scripts/focus-flow.js status`
- Add natural language task: `node .agents/skills/focus-flow/scripts/focus-flow.js add "<task text with date/time>"`
- List today's tasks: `node .agents/skills/focus-flow/scripts/focus-flow.js list`
- List tasks for a date: `node .agents/skills/focus-flow/scripts/focus-flow.js list "<date or relative string>"`
- Mark task complete: `node .agents/skills/focus-flow/scripts/focus-flow.js done <task_id>`
- Delete task: `node .agents/skills/focus-flow/scripts/focus-flow.js del <task_id>`
- Start pomodoro: `node .agents/skills/focus-flow/scripts/focus-flow.js focus <minutes> [task_id]`
- Pause pomodoro: `node .agents/skills/focus-flow/scripts/focus-flow.js pause`
- Stop pomodoro: `node .agents/skills/focus-flow/scripts/focus-flow.js stop`

## Direct HTTP API (Port 23119)
If you prefer HTTP calls:
- `GET http://127.0.0.1:23119/health`
- `POST http://127.0.0.1:23119/api/tasks` body: `{"text":"..."}`
- `GET http://127.0.0.1:23119/api/today`
- `POST http://127.0.0.1:23119/api/complete` body: `{"id":"..."}`
- `POST http://127.0.0.1:23119/api/focus/start` body: `{"minutes":25}`
