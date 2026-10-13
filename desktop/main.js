const { app, BrowserWindow, screen, clipboard, ipcMain, Menu, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { fmt, extractDate, parseTaskText } = require('./src/parser');

const PORT = 23119;

// Disable GPU acceleration: required on remote/VM displays where the
// GPU process crashes on startup ("GPU process isn't usable. Goodbye.")
app.disableHardwareAcceleration();
const DATA_DIR = path.join(app.getPath('home'), '.focus-flow');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const INBOX_FILE = path.join(DATA_DIR, 'inbox.txt');

const BALL = 80;
const PANEL_W = 340;
const PANEL_H = 480;

let win = null;
let histWin = null;
let ballAnchor = null;
let expanded = false;
let focus = { running: false, endsAt: null, minutes: 25, taskId: null, timer: null };
let lastClip = '';
let dragBase = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) win.show(); });
}

function todayStr() { return fmt(new Date()); }

function ensureFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TASKS_FILE)) fs.writeFileSync(TASKS_FILE, JSON.stringify({ tasks: [], focusHistory: [] }));
  if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify({ apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', autoStart: false }));
  if (!fs.existsSync(INBOX_FILE)) fs.writeFileSync(INBOX_FILE, '');
}

const load = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const save = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

function defaultAnchor() {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - BALL - 16, y: workArea.y + workArea.height - BALL - 16 };
}

function clampPos(x, y) {
  const { workArea } = screen.getPrimaryDisplay();
  x = Math.max(workArea.x + 8, Math.min(x, workArea.x + workArea.width - BALL - 8));
  y = Math.max(workArea.y + 8, Math.min(y, workArea.y + workArea.height - BALL - 8));
  return { x, y };
}

function persistAnchor() {
  try {
    const cfg = load(CONFIG_FILE);
    cfg.ballPos = ballAnchor;
    save(CONFIG_FILE, cfg);
  } catch (e) { /* ignore */ }
}

function notifyTaskAdded(parsed) {
  try {
    const body = parsed.tasks.map(t => `${t.title}（${t.date}${t.time ? ' ' + t.time : ''}）`).join('；');
    new Notification({ title: 'Focus Flow 已添加任务', body }).show();
  } catch (e) { /* ignore */ }
}

function refreshRenderer() {
  if (win && !win.isDestroyed()) win.webContents.send('refresh-state');
}

function addTask(text, source) {
  const parsed = parseTaskText(text);
  const data = load(TASKS_FILE);
  parsed.tasks.forEach(t => {
    data.tasks.push({
      id: 't' + Date.now() + Math.random().toString(36).slice(2, 7),
      title: String(t.title || '新任务').slice(0, 120),
      date: t.date,
      time: t.time || null,
      status: 'todo',
      source: source || 'manual',
      focusMinutes: 0,
      createdAt: Date.now()
    });
  });
  save(TASKS_FILE, data);
  notifyTaskAdded(parsed);
  refreshRenderer();
  return { ok: true, added: parsed.tasks.length, tasks: parsed.tasks };
}

function setStatus(id, status) {
  const data = load(TASKS_FILE);
  const t = data.tasks.find(x => x.id === id);
  if (t) { t.status = status; save(TASKS_FILE, data); }
  refreshRenderer();
  return { ok: true };
}

function deleteTask(id) {
  const data = load(TASKS_FILE);
  const before = data.tasks.length;
  data.tasks = data.tasks.filter(x => x.id !== id);
  save(TASKS_FILE, data);
  refreshRenderer();
  return { ok: true, deleted: before - data.tasks.length };
}

function getHistory(filters = {}) {
  const data = load(TASKS_FILE);
  let tasks = data.tasks.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (filters.status) tasks = tasks.filter(t => t.status === filters.status);
  if (filters.start) tasks = tasks.filter(t => t.date >= filters.start);
  if (filters.end) tasks = tasks.filter(t => t.date <= filters.end);
  if (filters.q) {
    const q = String(filters.q).toLowerCase();
    tasks = tasks.filter(t => t.title.toLowerCase().includes(q));
  }
  return { tasks };
}

function focusStart(minutes, taskId) {
  const m = Math.max(1, Math.min(parseInt(minutes, 10) || 25, 180));
  focus.minutes = m;
  focus.taskId = taskId || null;
  focus.endsAt = Date.now() + m * 60000;
  focus.running = true;
  clearInterval(focus.timer);
  focus.timer = setInterval(() => {
    const remain = Math.round((focus.endsAt - Date.now()) / 1000);
    if (win && !win.isDestroyed()) win.webContents.send('focus-tick', { running: true, remaining: Math.max(0, remain) });
    if (remain <= 0) focusStop(true);
  }, 1000);
  refreshRenderer();
  return { ok: true, minutes: m };
}

function focusStop(completed) {
  clearInterval(focus.timer);
  if (completed && focus.taskId) {
    const data = load(TASKS_FILE);
    const t = data.tasks.find(x => x.id === focus.taskId);
    if (t) t.focusMinutes += focus.minutes;
    data.focusHistory.push({ date: todayStr(), minutes: focus.minutes, at: Date.now() });
    save(TASKS_FILE, data);
  }
  if (completed) {
    try { new Notification({ title: '专注完成', body: `已专注 ${focus.minutes} 分钟，休息一下吧` }).show(); } catch (e) { /* ignore */ }
  }
  focus.running = false;
  focus.endsAt = null;
  if (win && !win.isDestroyed()) win.webContents.send('focus-tick', { running: false, remaining: 0 });
  refreshRenderer();
  return { ok: true };
}

function setExpanded(on) {
  if (!win || win.isDestroyed()) return;
  expanded = !!on;
  const { workArea } = screen.getPrimaryDisplay();
  if (on) {
    const x = Math.max(workArea.x, Math.min(ballAnchor.x + BALL - PANEL_W, workArea.x + workArea.width - PANEL_W));
    const y = Math.max(workArea.y, Math.min(ballAnchor.y + BALL - PANEL_H, workArea.y + workArea.height - PANEL_H));
    win.setBounds({ x, y, width: PANEL_W, height: PANEL_H });
  } else {
    win.setBounds({ x: ballAnchor.x, y: ballAnchor.y, width: BALL, height: BALL });
  }
  win.webContents.send('ui-state', { expanded });
}

function createBallWindow() {
  const cfg = load(CONFIG_FILE);
  ballAnchor = clampPos((cfg.ballPos && cfg.ballPos.x !== undefined) ? cfg.ballPos.x : defaultAnchor().x,
                        (cfg.ballPos && cfg.ballPos.y !== undefined) ? cfg.ballPos.y : defaultAnchor().y);

  win = new BrowserWindow({
    width: BALL,
    height: BALL,
    x: ballAnchor.x,
    y: ballAnchor.y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'src', 'ball.html'));
  win.on('closed', () => { win = null; });
}

function createHistoryWindow() {
  if (histWin && !histWin.isDestroyed()) { histWin.show(); return; }
  histWin = new BrowserWindow({
    width: 900,
    height: 620,
    minWidth: 720,
    minHeight: 420,
    title: 'Focus Flow 历史',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  histWin.loadFile(path.join(__dirname, 'src', 'history.html'));
  histWin.on('closed', () => { histWin = null; });
}

function startServer() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...cors });
      res.end(JSON.stringify(obj));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

    if (req.method === 'GET') {
      if (u.pathname === '/health') return send(200, { ok: true, app: 'focus-flow', version: '1.0.0' });
      if (u.pathname === '/api/tasks') return send(200, load(TASKS_FILE));
      if (u.pathname === '/api/today') {
        const q = u.searchParams.get('date');
        let date = todayStr();
        if (q) { const d = extractDate(q); if (d) date = d.date; }
        const data = load(TASKS_FILE);
        return send(200, { date, tasks: data.tasks.filter(t => t.date === date) });
      }
      if (u.pathname === '/api/history') {
        const status = u.searchParams.get('status') || '';
        const start = u.searchParams.get('start') || '';
        const end = u.searchParams.get('end') || '';
        const q = u.searchParams.get('q') || '';
        return send(200, getHistory({ status, start, end, q }));
      }
      return send(404, { error: 'not found' });
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        let json = {};
        try { json = JSON.parse(body || '{}'); } catch (e) { return send(400, { error: 'invalid json' }); }
        if (u.pathname === '/api/tasks') {
          if (!json.text) return send(400, { error: 'text required' });
          return send(200, addTask(json.text, json.source || 'http'));
        }
        if (u.pathname === '/api/complete') {
          if (!json.id) return send(400, { error: 'id required' });
          return send(200, setStatus(json.id, 'done'));
        }
        if (u.pathname === '/api/delete') {
          if (!json.id) return send(400, { error: 'id required' });
          return send(200, deleteTask(json.id));
        }
        if (u.pathname === '/api/focus/start') return send(200, focusStart(json.minutes, json.taskId));
        if (u.pathname === '/api/focus/stop') return send(200, focusStop(false));
        return send(404, { error: 'not found' });
      });
      return;
    }
    return send(404, { error: 'not found' });
  });
  server.listen(PORT, '127.0.0.1');
}

function startWatchers() {
  lastClip = clipboard.readText() || '';

  setInterval(() => {
    try {
      const txt = clipboard.readText();
      if (txt && txt !== lastClip) {
        lastClip = txt;
        const trimmed = txt.trim();
        if (/^#task/i.test(trimmed)) {
          const content = trimmed.replace(/^#task/i, '').trim();
          if (content) addTask(content, 'clipboard');
        }
      }
    } catch (e) { /* ignore */ }
  }, 2000);

  setInterval(() => {
    try {
      const stat = fs.statSync(INBOX_FILE);
      if (stat.size > 0) {
        const content = fs.readFileSync(INBOX_FILE, 'utf8');
        fs.writeFileSync(INBOX_FILE, '');
        if (content.trim()) addTask(content, 'inbox');
      }
    } catch (e) { /* ignore */ }
  }, 2000);
}

function applyAutoStart() {
  try {
    const cfg = load(CONFIG_FILE);
    app.setLoginItemSettings({ openAtLogin: !!cfg.autoStart });
  } catch (e) { /* ignore */ }
}

async function askAI(message) {
  const cfg = load(CONFIG_FILE);
  if (!cfg.apiKey) return { ok: false, error: '未配置 API Key，请到「设置」标签页填写后重试' };
  try {
    const today = todayStr();
    const sys = `今天是${today}。你是任务提取器。从用户消息中提取待办任务，输出严格的JSON数组，每个元素形如 {"title":"简洁任务名","date":"YYYY-MM-DD","time":"HH:MM"或null}。相对日期（后天/明天/下周三等）必须换算成具体日期。如果没有任务，输出 []。不要输出JSON以外的任何内容。`;
    const resp = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: sys }, { role: 'user', content: message }], temperature: 0 })
    });
    if (!resp.ok) return { ok: false, error: `API 返回 ${resp.status}` };
    const data = await resp.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    const m = content.match(/\[[\s\S]*\]/);
    const items = m ? JSON.parse(m[0]) : [];
    const store = load(TASKS_FILE);
    items.forEach(it => {
      store.tasks.push({
        id: 't' + Date.now() + Math.random().toString(36).slice(2, 7),
        title: String(it.title || '新任务').slice(0, 120),
        date: it.date || today,
        time: it.time || null,
        status: 'todo',
        source: 'ai',
        focusMinutes: 0,
        createdAt: Date.now()
      });
    });
    save(TASKS_FILE, store);
    refreshRenderer();
    if (!items.length) return { ok: true, reply: '没识别到新任务' };
    return { ok: true, reply: `已添加 ${items.length} 个任务：` + items.map(i => `${i.title}（${i.date}${i.time ? ' ' + i.time : ''}）`).join('；') };
  } catch (err) {
    return { ok: false, error: 'AI 调用失败：' + err.message };
  }
}

ipcMain.handle('get-state', () => {
  const data = load(TASKS_FILE);
  const today = todayStr();
  return {
    date: today,
    tasks: data.tasks.filter(t => t.date === today),
    allTasks: data.tasks.filter(t => t.status !== 'done').slice(-30),
    focus: {
      running: focus.running,
      remaining: focus.running ? Math.max(0, Math.round((focus.endsAt - Date.now()) / 1000)) : 0,
      minutes: focus.minutes,
      taskId: focus.taskId
    },
    focusToday: data.focusHistory.filter(h => h.date === today).reduce((s, h) => s + h.minutes, 0),
    config: load(CONFIG_FILE)
  };
});

ipcMain.handle('add-task', (e, p) => addTask(p.text, p.source || 'manual'));
ipcMain.handle('set-status', (e, p) => setStatus(p.id, p.status));
ipcMain.handle('delete-task', (e, p) => deleteTask(p.id));
ipcMain.handle('get-history', (e, p) => getHistory(p || {}));
ipcMain.handle('focus-start', (e, p) => focusStart(p.minutes, p.taskId));
ipcMain.handle('focus-stop', () => focusStop(false));
ipcMain.handle('ask-ai', (e, message) => askAI(message));

ipcMain.handle('save-config', (e, c) => {
  const cfg = load(CONFIG_FILE);
  Object.assign(cfg, {
    apiKey: c.apiKey !== undefined ? String(c.apiKey) : cfg.apiKey,
    baseUrl: c.baseUrl || cfg.baseUrl,
    model: c.model || cfg.model,
    autoStart: !!c.autoStart
  });
  save(CONFIG_FILE, cfg);
  applyAutoStart();
  refreshRenderer();
  return { ok: true };
});

ipcMain.on('expand', () => setExpanded(true));
ipcMain.on('shrink', () => setExpanded(false));
ipcMain.on('ball-click', () => setExpanded(!expanded));

ipcMain.on('drag-start', () => { if (!expanded) dragBase = { ...ballAnchor }; });
ipcMain.on('drag-move', (e, dx, dy) => {
  if (!dragBase || expanded) return;
  ballAnchor = clampPos(dragBase.x + dx, dragBase.y + dy);
  win.setPosition(ballAnchor.x, ballAnchor.y);
});
ipcMain.on('drag-end', () => { dragBase = null; persistAnchor(); });

ipcMain.on('show-menu', () => {
  Menu.popup(Menu.buildFromTemplate([
    { label: expanded ? '收起面板' : '展开面板', click: () => setExpanded(!expanded) },
    { label: '历史记录', click: () => createHistoryWindow() },
    { label: '打开数据目录', click: () => shell.openPath(DATA_DIR) },
    { type: 'separator' },
    { label: '退出 Focus Flow', click: () => app.quit() }
  ]));
});

ipcMain.on('open-history', () => createHistoryWindow());

app.whenReady().then(() => {
  ensureFiles();
  createBallWindow();
  startServer();
  startWatchers();
  applyAutoStart();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => persistAnchor());
