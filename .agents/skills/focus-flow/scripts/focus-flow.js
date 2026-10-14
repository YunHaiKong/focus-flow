#!/usr/bin/env node
/**
 * Focus Flow Skill CLI Helper for Gemini & AI Agents
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 23119;
const DATA_DIR = path.join(os.homedir(), '.focus-flow');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const INBOX_FILE = path.join(DATA_DIR, 'inbox.txt');

function request(method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: pathname,
        method,
        headers: data
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data),
            }
          : {},
        timeout: 2000,
      },
      (res) => {
        let resBody = '';
        res.on('data', (c) => (resBody += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(resBody || '{}') });
          } catch (e) {
            resolve({ status: res.statusCode, data: resBody });
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (data) req.write(data);
    req.end();
  });
}

async function isServerRunning() {
  try {
    const res = await request('GET', '/health');
    return res.status === 200 && res.data.ok;
  } catch (e) {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const action = args[0] || 'status';

  const running = await isServerRunning();

  if (action === 'status') {
    if (!running) {
      console.log(JSON.stringify({ ok: true, running: false, message: 'Focus Flow 桌面应用未在运行（离线模式）' }, null, 2));
      return;
    }
    const health = await request('GET', '/health');
    const today = await request('GET', '/api/today');
    console.log(JSON.stringify({ ok: true, running: true, health: health.data, today: today.data }, null, 2));
    return;
  }

  if (action === 'add') {
    const text = args.slice(1).join(' ').trim();
    if (!text) {
      console.error(JSON.stringify({ ok: false, error: '请提供要添加的任务内容' }));
      process.exit(1);
    }
    if (running) {
      const res = await request('POST', '/api/tasks', { text, source: 'gemini-skill' });
      console.log(JSON.stringify(res.data, null, 2));
    } else {
      // Fallback: 写入 inbox.txt
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.appendFileSync(INBOX_FILE, text + '\n', 'utf8');
      console.log(JSON.stringify({ ok: true, channel: 'inbox', message: '已写入 inbox.txt，桌面端启动后将自动解析入库', text }, null, 2));
    }
    return;
  }

  if (action === 'list') {
    const dateQuery = args[1] ? `?date=${encodeURIComponent(args[1])}` : '';
    if (running) {
      const res = await request('GET', `/api/today${dateQuery}`);
      console.log(JSON.stringify(res.data, null, 2));
    } else {
      if (fs.existsSync(TASKS_FILE)) {
        const raw = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8') || '{"tasks":[]}');
        console.log(JSON.stringify({ ok: true, offline: true, tasks: raw.tasks || [] }, null, 2));
      } else {
        console.log(JSON.stringify({ ok: true, tasks: [] }, null, 2));
      }
    }
    return;
  }

  if (action === 'done') {
    const id = args[1];
    if (!id) {
      console.error(JSON.stringify({ ok: false, error: '请指定要完成的任务 ID' }));
      process.exit(1);
    }
    if (running) {
      const res = await request('POST', '/api/complete', { id });
      console.log(JSON.stringify(res.data, null, 2));
    } else {
      console.error(JSON.stringify({ ok: false, error: '桌面端未运行，无法通过 API 更新状态' }));
    }
    return;
  }

  if (action === 'priority') {
    const id = args[1];
    if (!id) {
      console.error(JSON.stringify({ ok: false, error: '请指定任务 ID' }));
      process.exit(1);
    }
    if (running) {
      const res = await request('POST', '/api/priority', { id });
      console.log(JSON.stringify(res.data, null, 2));
    } else {
      console.error(JSON.stringify({ ok: false, error: '桌面端未运行' }));
    }
    return;
  }

  if (action === 'postpone') {
    if (running) {
      const res = await request('POST', '/api/tasks/postpone');
      console.log(JSON.stringify(res.data, null, 2));
    } else {
      console.error(JSON.stringify({ ok: false, error: '桌面端未运行' }));
    }
    return;
  }

  if (action === 'del') {
    const id = args[1];
    if (!id) {
      console.error(JSON.stringify({ ok: false, error: '请指定要删除的任务 ID' }));
      process.exit(1);
    }
    if (running) {
      const res = await request('POST', '/api/delete', { id });
      console.log(JSON.stringify(res.data, null, 2));
    } else {
      console.error(JSON.stringify({ ok: false, error: '桌面端未运行' }));
    }
    return;
  }

  if (action === 'focus') {
    const minutes = parseInt(args[1], 10) || 25;
    const taskId = args[2] || null;
    if (running) {
      const res = await request('POST', '/api/focus/start', { minutes, taskId });
      console.log(JSON.stringify(res.data, null, 2));
    } else {
      console.error(JSON.stringify({ ok: false, error: '桌面端未运行，无法启动番茄专注' }));
    }
    return;
  }

  if (action === 'pause') {
    if (running) {
      const res = await request('POST', '/api/focus/pause');
      console.log(JSON.stringify(res.data, null, 2));
    } else {
      console.error(JSON.stringify({ ok: false, error: '桌面端未运行' }));
    }
    return;
  }

  if (action === 'stop') {
    if (running) {
      const res = await request('POST', '/api/focus/stop');
      console.log(JSON.stringify(res.data, null, 2));
    } else {
      console.error(JSON.stringify({ ok: false, error: '桌面端未运行' }));
    }
    return;
  }

  console.log(JSON.stringify({
    ok: false,
    error: `未知操作: ${action}。支持: status, add, list, done, del, focus, pause, stop`
  }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
