#!/usr/bin/env node
/**
 * Focus Flow - Model Context Protocol (MCP) Server
 * Compatible with Claude Desktop, Cursor, Windsurf, and all MCP-compliant tools.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

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

const TOOLS = [
  {
    name: 'add_task',
    description: '添加待办任务到 Focus Flow 桌面悬浮球（支持中文自然语言时间，如"明天下午3点半开会"、"周五交报告"）',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '任务内容，可包含日期和具体时间' },
        priority: { type: 'string', enum: ['normal', 'high'], description: '优先级：normal 普通，high 高优置顶', default: 'normal' }
      },
      required: ['text']
    }
  },
  {
    name: 'get_today_tasks',
    description: '获取 Focus Flow 悬浮球今日待办任务列表及完成状态',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_tasks_by_date',
    description: '查询 Focus Flow 中指定日期的任务列表',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '日期，如 2026-10-15、明天、周四、10.16' }
      },
      required: ['date']
    }
  },
  {
    name: 'complete_task',
    description: '将 Focus Flow 中指定 ID 的任务标记为已完成',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '任务 ID，如 t1697...' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_task',
    description: '从 Focus Flow 中删除指定 ID 的任务',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '任务 ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'postpone_undone_tasks',
    description: '一键将今天所有未完成的任务顺延推迟至明天',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'start_focus',
    description: '启动桌面番茄钟专注计时器',
    inputSchema: {
      type: 'object',
      properties: {
        minutes: { type: 'number', description: '专注分钟数，默认 25 分钟', default: 25 },
        taskId: { type: 'string', description: '可选，关联要专注的具体任务 ID' }
      }
    }
  },
  {
    name: 'pause_focus',
    description: '暂停当前正在进行的番茄钟专注计时（保留剩余进度）',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'stop_focus',
    description: '停止或重置番茄钟专注计时',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

async function handleToolCall(name, args) {
  const running = await isServerRunning();

  if (name === 'add_task') {
    const text = args.text;
    const priority = args.priority || 'normal';
    if (running) {
      const res = await request('POST', '/api/tasks', { text, source: 'mcp', priority });
      return { content: [{ type: 'text', text: `成功添加任务：${JSON.stringify(res.data.tasks || res.data)}` }] };
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.appendFileSync(INBOX_FILE, text + '\n', 'utf8');
      return { content: [{ type: 'text', text: `桌面端当前未启动，已写入 inbox.txt，悬浮球启动后将自动解析入库：${text}` }] };
    }
  }

  if (name === 'get_today_tasks') {
    if (running) {
      const res = await request('GET', '/api/today');
      return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
    } else {
      if (fs.existsSync(TASKS_FILE)) {
        const d = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8') || '{"tasks":[]}');
        return { content: [{ type: 'text', text: JSON.stringify({ offline: true, tasks: d.tasks || [] }, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ tasks: [] }) }] };
    }
  }

  if (name === 'get_tasks_by_date') {
    const q = encodeURIComponent(args.date);
    if (running) {
      const res = await request('GET', `/api/today?date=${q}`);
      return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
    }
    return { content: [{ type: 'text', text: '桌面端未在运行，无法使用动态日期解析查询' }] };
  }

  if (name === 'complete_task') {
    if (running) {
      const res = await request('POST', '/api/complete', { id: args.id });
      return { content: [{ type: 'text', text: `任务 ${args.id} 已标记完成` }] };
    }
    return { content: [{ type: 'text', text: '桌面端未在运行' }] };
  }

  if (name === 'delete_task') {
    if (running) {
      const res = await request('POST', '/api/delete', { id: args.id });
      return { content: [{ type: 'text', text: `任务 ${args.id} 已删除` }] };
    }
    return { content: [{ type: 'text', text: '桌面端未在运行' }] };
  }

  if (name === 'postpone_undone_tasks') {
    if (running) {
      const res = await request('POST', '/api/tasks/postpone');
      return { content: [{ type: 'text', text: `未完成任务顺延结果：${JSON.stringify(res.data)}` }] };
    }
    return { content: [{ type: 'text', text: '桌面端未在运行' }] };
  }

  if (name === 'start_focus') {
    if (running) {
      const res = await request('POST', '/api/focus/start', { minutes: args.minutes || 25, taskId: args.taskId });
      return { content: [{ type: 'text', text: `番茄钟已启动专注：${args.minutes || 25} 分钟` }] };
    }
    return { content: [{ type: 'text', text: '桌面端未在运行' }] };
  }

  if (name === 'pause_focus') {
    if (running) {
      const res = await request('POST', '/api/focus/pause');
      return { content: [{ type: 'text', text: `番茄钟已暂停：剩余 ${res.data.remaining} 秒` }] };
    }
    return { content: [{ type: 'text', text: '桌面端未在运行' }] };
  }

  if (name === 'stop_focus') {
    if (running) {
      await request('POST', '/api/focus/stop');
      return { content: [{ type: 'text', text: '番茄钟专注已停止并重置' }] };
    }
    return { content: [{ type: 'text', text: '桌面端未在运行' }] };
  }

  throw new Error(`未知的工具方法: ${name}`);
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  line = line.trim();
  if (!line) return;
  try {
    const req = JSON.parse(line);
    const { id, method, params } = req;

    if (method === 'initialize') {
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'focus-flow-mcp',
            version: '1.1.0'
          },
          capabilities: {
            tools: {}
          }
        }
      });
    }

    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'ping') {
      return send({ jsonrpc: '2.0', id, result: {} });
    }

    if (method === 'tools/list') {
      return send({
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS }
      });
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params || {};
      try {
        const result = await handleToolCall(name, args || {});
        return send({
          jsonrpc: '2.0',
          id,
          result
        });
      } catch (err) {
        return send({
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [{ type: 'text', text: '执行错误: ' + err.message }]
          }
        });
      }
    }

    send({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found' }
    });
  } catch (e) {
    // ignore parse errors
  }
});
