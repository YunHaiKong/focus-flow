# AI Agent Guidelines for Focus Flow

This repository contains a desktop floating ball and task manager. All agents (Claude Code, OpenAI Codex, Cursor, Windsurf, Antigravity, etc.) can control the user's tasks and pomodoro timer using the standardized CLI tool:

## Quick Commands
- Add task: `node .agents/skills/focus-flow/scripts/focus-flow.js add "<task>"`
- View tasks: `node .agents/skills/focus-flow/scripts/focus-flow.js list`
- Complete task: `node .agents/skills/focus-flow/scripts/focus-flow.js done <id>`
- Start focus timer: `node .agents/skills/focus-flow/scripts/focus-flow.js focus <minutes>`
- Pause focus timer: `node .agents/skills/focus-flow/scripts/focus-flow.js pause`
- Stop focus timer: `node .agents/skills/focus-flow/scripts/focus-flow.js stop`

## Offline Fallback
If the desktop app is not currently running, running `node .../focus-flow.js add "..."` automatically appends the task to `~/.focus-flow/inbox.txt`, which will be ingested as soon as the user starts the desktop ball.
