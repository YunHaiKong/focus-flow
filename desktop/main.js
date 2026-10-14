const { app, BrowserWindow, screen, clipboard, ipcMain, Menu, Notification, shell, Tray, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { fmt, addDays, extractDate, parseTaskText } = require('./src/parser');

const PORT = 23119;

// Disable GPU acceleration for virtual display compatibility
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
let tray = null;
let ballAnchor = null;
let dockEdge = null; // 'left' | 'right' | null
let expanded = false;
let focus = {
  running: false,
  paused: false,
  mode: 'work', // 'work' | 'break'
  pomodoroCount: 0,
  endsAt: null,
  remaining: 0,
  totalSeconds: 25 * 60,
  minutes: 25,
  taskId: null,
  timer: null,
  startedAt: null
};
let lastClip = '';
let dragBase = null;
let serverInstance = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) {
      createBallWindow();
    } else {
      if (win.isMinimized()) win.restore();
      win.show();
      win.setAlwaysOnTop(true);
      win.focus();
      setExpanded(true);
    }
  });
}

function todayStr() { return fmt(new Date()); }

function load(f, fallback = {}) {
  try {
    if (!fs.existsSync(f)) return fallback;
    const str = fs.readFileSync(f, 'utf8');
    if (!str.trim()) return fallback;
    return JSON.parse(str);
  } catch (e) {
    console.error(`[FocusFlow] Failed to load ${f}:`, e.message);
    const bak = f + '.bak';
    if (fs.existsSync(bak)) {
      try {
        return JSON.parse(fs.readFileSync(bak, 'utf8'));
      } catch (e2) {}
    }
    return fallback;
  }
}

function save(f, d) {
  try {
    const str = JSON.stringify(d, null, 2);
    const tmp = f + '.tmp';
    const bak = f + '.bak';
    fs.writeFileSync(tmp, str, 'utf8');
    if (fs.existsSync(f)) {
      try { fs.copyFileSync(f, bak); } catch (e) {}
    }
    fs.renameSync(tmp, f);
  } catch (e) {
    console.error(`[FocusFlow] Failed to save ${f}:`, e.message);
  }
}

function ensureFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TASKS_FILE)) save(TASKS_FILE, { tasks: [], focusHistory: [] });
  if (!fs.existsSync(CONFIG_FILE)) {
    save(CONFIG_FILE, {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      autoStart: false,
      clipboardWatch: true,
      hotkey: 'Alt+Shift+F',
      soundEnabled: true,
      edgeSnapping: true
    });
  }
  if (!fs.existsSync(INBOX_FILE)) fs.writeFileSync(INBOX_FILE, '');
}

function defaultAnchor() {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - BALL - 16, y: workArea.y + workArea.height - BALL - 16 };
}

function clampPos(x, y) {
  const disp = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }) || screen.getPrimaryDisplay();
  const { workArea } = disp;
  x = Math.max(workArea.x + 8, Math.min(x, workArea.x + workArea.width - BALL - 8));
  y = Math.max(workArea.y + 8, Math.min(y, workArea.y + workArea.height - BALL - 8));
  return { x, y };
}

function checkEdgeDock() {
  if (expanded || !win || win.isDestroyed()) return;
  const cfg = load(CONFIG_FILE, {});
  if (cfg.edgeSnapping === false) return;
  const disp = screen.getDisplayNearestPoint(ballAnchor) || screen.getPrimaryDisplay();
  const { workArea } = disp;
  // Snap cleanly to edge without shifting off-screen (prevents mouse jitter/flicker)
  if (ballAnchor.x <= workArea.x + 24) {
    ballAnchor.x = workArea.x + 4;
  } else if (ballAnchor.x >= workArea.x + workArea.width - BALL - 24) {
    ballAnchor.x = workArea.x + workArea.width - BALL - 4;
  }
  win.setPosition(ballAnchor.x, ballAnchor.y);
  persistAnchor();
}

function undockEdge() {
  // Safe no-op: window position stays stable to prevent mouse flicker loop
}

function redockEdge() {
  // Safe no-op: window position stays stable to prevent mouse flicker loop
}

function persistAnchor() {
  try {
    const cfg = load(CONFIG_FILE, {});
    cfg.ballPos = ballAnchor;
    save(CONFIG_FILE, cfg);
  } catch (e) { /* ignore */ }
}

function resetAnchor() {
  ballAnchor = defaultAnchor();
  dockEdge = null;
  persistAnchor();
  if (win && !win.isDestroyed()) {
    win.setBounds({ x: ballAnchor.x, y: ballAnchor.y, width: BALL, height: BALL });
    win.show();
  }
}

function registerGlobalShortcut() {
  try {
    globalShortcut.unregisterAll();
    const cfg = load(CONFIG_FILE, {});
    const hotkey = cfg.hotkey || 'Alt+Shift+F';
    const ok = globalShortcut.register(hotkey, () => {
      if (!win || win.isDestroyed()) return;
      if (expanded) {
        setExpanded(false);
      } else {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        setExpanded(true);
        setTimeout(() => {
          if (win && !win.isDestroyed()) win.webContents.send('focus-input');
        }, 120);
      }
    });
    if (!ok) console.warn('[FocusFlow] Hotkey register failed:', hotkey);
  } catch (e) {
    console.warn('[FocusFlow] Global shortcut register error:', e.message);
  }
}

function notifyTaskAdded(parsed) {
  try {
    const body = parsed.tasks.map(t => `${t.title}（${t.date}${t.time ? ' ' + t.time : ''}）`).join('；');
    new Notification({ title: 'Focus Flow 已添加任务', body }).show();
  } catch (e) { /* ignore */ }
}

function refreshRenderer() {
  if (win && !win.isDestroyed()) win.webContents.send('refresh-state');
  if (histWin && !histWin.isDestroyed()) histWin.webContents.send('refresh-state');
}

function addTask(text, source, priority = 'normal') {
  const parsed = parseTaskText(text);
  const data = load(TASKS_FILE, { tasks: [], focusHistory: [] });
  parsed.tasks.forEach(t => {
    data.tasks.push({
      id: 't' + Date.now() + Math.random().toString(36).slice(2, 7),
      title: String(t.title || '新任务').slice(0, 120),
      date: t.date,
      time: t.time || null,
      priority: priority === 'high' ? 'high' : 'normal',
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
  const data = load(TASKS_FILE, { tasks: [], focusHistory: [] });
  const t = data.tasks.find(x => x.id === id);
  if (t) { t.status = status; save(TASKS_FILE, data); }
  refreshRenderer();
  return { ok: true };
}

function togglePriority(id) {
  const data = load(TASKS_FILE, { tasks: [], focusHistory: [] });
  const t = data.tasks.find(x => x.id === id);
  if (!t) return { ok: false, error: 'task not found' };
  t.priority = t.priority === 'high' ? 'normal' : 'high';
  save(TASKS_FILE, data);
  refreshRenderer();
  return { ok: true, priority: t.priority };
}

function postponeUndoneTasks() {
  const data = load(TASKS_FILE, { tasks: [], focusHistory: [] });
  const today = todayStr();
  const nextDay = addDays(today, 1);
  let count = 0;
  data.tasks.forEach(t => {
    if (t.date === today && t.status !== 'done') {
      t.date = nextDay;
      count++;
    }
  });
  if (count > 0) {
    save(TASKS_FILE, data);
    refreshRenderer();
  }
  return { ok: true, postponed: count, nextDate: nextDay };
}

function updateTask(id, fields) {
  const data = load(TASKS_FILE, { tasks: [], focusHistory: [] });
  const t = data.tasks.find(x => x.id === id);
  if (!t) return { ok: false, error: 'task not found' };
  if (fields.title !== undefined) t.title = String(fields.title).slice(0, 120);
  if (fields.date !== undefined) t.date = fields.date;
  if (fields.time !== undefined) t.time = fields.time;
  if (fields.priority !== undefined) t.priority = fields.priority;
  if (fields.status !== undefined) t.status = fields.status;
  save(TASKS_FILE, data);
  refreshRenderer();
  return { ok: true, task: t };
}

function deleteTask(id) {
  const data = load(TASKS_FILE, { tasks: [], focusHistory: [] });
  const before = data.tasks.length;
  data.tasks = data.tasks.filter(x => x.id !== id);
  save(TASKS_FILE, data);
  refreshRenderer();
  return { ok: true, deleted: before - data.tasks.length };
}

function getHistory(filters = {}) {
  const data = load(TASKS_FILE, { tasks: [], focusHistory: [] });
  let tasks = data.tasks.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (filters.status) tasks = tasks.filter(t => t.status === filters.status);
  if (filters.priority) tasks = tasks.filter(t => t.priority === filters.priority);
  if (filters.start) tasks = tasks.filter(t => t.date >= filters.start);
  if (filters.end) tasks = tasks.filter(t => t.date <= filters.end);
  if (filters.q) {
    const q = String(filters.q).toLowerCase();
    tasks = tasks.filter(t => t.title.toLowerCase().includes(q));
  }

  // Calculate past 14 days focus stats for heatmap
  const dayStats = {};
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dayStats[fmt(d)] = 0;
  }
  let totalMinutes = 0;
  (data.focusHistory || []).forEach(h => {
    totalMinutes += (h.minutes || 0);
    if (dayStats[h.date] !== undefined) {
      dayStats[h.date] += (h.minutes || 0);
    }
  });

  return {
    tasks,
    stats: {
      dayStats,
      totalMinutes,
      pomodorosCount: Math.round(totalMinutes / 25)
    }
  };
}

function startFocusTimer() {
  clearInterval(focus.timer);
  focus.timer = setInterval(() => {
    const remain = Math.round((focus.endsAt - Date.now()) / 1000);
    focus.remaining = Math.max(0, remain);
    if (win && !win.isDestroyed()) {
      win.webContents.send('focus-tick', {
        running: true,
        paused: false,
        mode: focus.mode,
        pomodoroCount: focus.pomodoroCount,
        remaining: focus.remaining,
        totalSeconds: focus.totalSeconds
      });
    }
    if (remain <= 0) focusStop(true);
  }, 1000);
}

function focusStart(minutes, taskId) {
  if (focus.paused && !minutes && focus.remaining > 0) {
    focus.running = true;
    focus.paused = false;
    focus.endsAt = Date.now() + focus.remaining * 1000;
    startFocusTimer();
    refreshRenderer();
    return { ok: true, running: true, paused: false, remaining: focus.remaining, mode: focus.mode };
  }
  const m = Math.max(1, Math.min(parseInt(minutes, 10) || 25, 180));
  focus.mode = 'work';
  focus.minutes = m;
  focus.taskId = taskId || null;
  focus.remaining = m * 60;
  focus.totalSeconds = m * 60;
  focus.endsAt = Date.now() + m * 60000;
  focus.running = true;
  focus.paused = false;
  focus.startedAt = Date.now();
  startFocusTimer();
  refreshRenderer();
  return { ok: true, running: true, paused: false, mode: 'work', minutes: m };
}

function focusStartBreak(minutes) {
  clearInterval(focus.timer);
  const m = Math.max(1, parseInt(minutes, 10) || 5);
  focus.mode = 'break';
  focus.minutes = m;
  focus.remaining = m * 60;
  focus.totalSeconds = m * 60;
  focus.endsAt = Date.now() + m * 60000;
  focus.running = true;
  focus.paused = false;
  focus.startedAt = Date.now();
  startFocusTimer();
  refreshRenderer();
  return { ok: true, running: true, mode: 'break', minutes: m };
}

function focusPause() {
  if (!focus.running) return { ok: false, error: 'not running' };
  clearInterval(focus.timer);
  focus.remaining = Math.max(0, Math.round((focus.endsAt - Date.now()) / 1000));
  focus.running = false;
  focus.paused = true;
  if (win && !win.isDestroyed()) {
    win.webContents.send('focus-tick', {
      running: false,
      paused: true,
      mode: focus.mode,
      pomodoroCount: focus.pomodoroCount,
      remaining: focus.remaining,
      totalSeconds: focus.totalSeconds
    });
  }
  refreshRenderer();
  return { ok: true, running: false, paused: true, remaining: focus.remaining, mode: focus.mode };
}

function focusStop(completed) {
  clearInterval(focus.timer);
  if (completed) {
    if (focus.mode === 'work') {
      focus.pomodoroCount++;
      const isLongBreak = focus.pomodoroCount % 4 === 0;
      const breakMinutes = isLongBreak ? 15 : 5;

      const elapsedMin = focus.startedAt ? Math.round((Date.now() - focus.startedAt) / 60000) : 0;
      const recordMinutes = focus.minutes;
      if (recordMinutes > 0 && focus.taskId) {
        const data = load(TASKS_FILE, { tasks: [], focusHistory: [] });
        const t = data.tasks.find(x => x.id === focus.taskId);
        if (t) t.focusMinutes = (t.focusMinutes || 0) + recordMinutes;
        data.focusHistory.push({ date: todayStr(), minutes: recordMinutes, at: Date.now() });
        save(TASKS_FILE, data);
      }
      try {
        new Notification({
          title: `Focus Flow · 专注完成 (第 ${focus.pomodoroCount} 轮)`,
          body: `已完成 ${focus.minutes} 分钟专注！已自动为您开启 ${breakMinutes} 分钟${isLongBreak ? '长休息' : '短休息'}放松一下~`
        }).show();
      } catch (e) { /* ignore */ }
      if (win && !win.isDestroyed()) win.webContents.send('play-chime');

      // Auto start break countdown
      focusStartBreak(breakMinutes);
      return { ok: true, nextMode: 'break', breakMinutes };
    } else {
      // Break completed
      try {
        new Notification({
          title: 'Focus Flow · 休息结束',
          body: '休息时间到！精力充沛，准备好开始下一个番茄钟了吗？'
        }).show();
      } catch (e) { /* ignore */ }
      if (win && !win.isDestroyed()) win.webContents.send('play-chime');
    }
  }

  focus.running = false;
  focus.paused = false;
  focus.mode = 'work';
  focus.endsAt = null;
  focus.remaining = 0;
  focus.totalSeconds = focus.minutes * 60;
  focus.startedAt = null;
  if (win && !win.isDestroyed()) {
    win.webContents.send('focus-tick', {
      running: false,
      paused: false,
      mode: 'work',
      pomodoroCount: focus.pomodoroCount,
      remaining: 0,
      totalSeconds: focus.totalSeconds
    });
  }
  refreshRenderer();
  return { ok: true };
}

function setExpanded(on) {
  if (!win || win.isDestroyed()) return;
  expanded = !!on;
  const disp = screen.getDisplayNearestPoint(ballAnchor) || screen.getPrimaryDisplay();
  const { workArea } = disp;
  if (on) {
    const x = Math.max(workArea.x, Math.min(ballAnchor.x + BALL - PANEL_W, workArea.x + workArea.width - PANEL_W));
    const y = Math.max(workArea.y, Math.min(ballAnchor.y + BALL - PANEL_H, workArea.y + workArea.height - PANEL_H));
    win.setBounds({ x, y, width: PANEL_W, height: PANEL_H });
  } else {
    win.setBounds({ x: ballAnchor.x, y: ballAnchor.y, width: BALL, height: BALL });
    checkEdgeDock();
  }
  win.webContents.send('ui-state', { expanded, dockEdge });
}

function createBallWindow() {
  const cfg = load(CONFIG_FILE, {});
  ballAnchor = clampPos((cfg.ballPos && cfg.ballPos.x !== undefined) ? cfg.ballPos.x : defaultAnchor().x,
                        (cfg.ballPos && cfg.ballPos.y !== undefined) ? cfg.ballPos.y : defaultAnchor().y);

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
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
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true);
  win.loadFile(path.join(__dirname, 'src', 'ball.html'));
  win.on('closed', () => { win = null; });
  win.webContents.once('did-finish-load', () => {
    setExpanded(true);
    try {
      new Notification({
        title: 'Focus Flow 桌面悬浮球已就绪',
        body: '面板已展开！点击空白处自动收起，悬浮球停靠在屏幕右下角。快捷键 Alt+Shift+F 随时呼出。',
        icon: fs.existsSync(iconPath) ? iconPath : undefined
      }).show();
    } catch (e) {}
  });
}

function createHistoryWindow() {
  if (histWin && !histWin.isDestroyed()) { histWin.show(); return; }
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  histWin = new BrowserWindow({
    width: 900,
    height: 620,
    minWidth: 720,
    minHeight: 420,
    title: 'Focus Flow 历史',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  histWin.loadFile(path.join(__dirname, 'src', 'history.html'));
  histWin.on('closed', () => { histWin = null; });
}

function createTray() {
  if (tray) return;
  try {
    const trayIconPath = path.join(__dirname, 'assets', 'tray.png');
    const mainIconPath = path.join(__dirname, 'assets', 'icon.png');
    let img;
    if (fs.existsSync(trayIconPath)) {
      img = nativeImage.createFromPath(trayIconPath);
    } else if (fs.existsSync(mainIconPath)) {
      img = nativeImage.createFromPath(mainIconPath);
    } else {
      const iconBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZElEQVQ4T2NkoBAwUqifYdQAkG1gYGBgeP7y1X90zfcPn/6jG3Du4hUMw6kF0DWiaUam0cMAug1o6Xq4+j9//mHExcbwD00zshlE9yVOGWIA3T6k0A1o3h01AB+D0QwA+c5Pcg4G3QAAAABJRU5ErkJggg==';
      img = nativeImage.createFromDataURL(iconBase64);
    }
    tray = new Tray(img);
    tray.setToolTip('Focus Flow 悬浮球 (Alt+Shift+F)');
    const contextMenu = Menu.buildFromTemplate([
      { label: '展开 / 收起面板 (Alt+Shift+F)', click: () => { if (win) { win.show(); setExpanded(!expanded); } } },
      { label: '重置悬浮球位置', click: () => resetAnchor() },
      { label: '历史记录', click: () => createHistoryWindow() },
      { label: '打开数据目录', click: () => shell.openPath(DATA_DIR) },
      { type: 'separator' },
      { label: '退出 Focus Flow', click: () => app.quit() }
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (win) {
        if (!win.isVisible()) win.show();
        setExpanded(!expanded);
      }
    });
  } catch (e) {
    console.warn('[FocusFlow] Tray creation skipped:', e.message);
  }
}

function startServer() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...cors });
      res.end(JSON.stringify(obj));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

    if (req.method === 'GET') {
      if (u.pathname === '/health') {
        return send(200, { ok: true, app: 'focus-flow', version: '1.1.0', port: PORT });
      }
      if (u.pathname === '/api/tasks') return send(200, load(TASKS_FILE, { tasks: [] }));
      if (u.pathname === '/api/today') {
        const q = u.searchParams.get('date');
        let date = todayStr();
        if (q) { const d = extractDate(q); if (d) date = d.date; }
        const data = load(TASKS_FILE, { tasks: [] });
        return send(200, { date, tasks: (data.tasks || []).filter(t => t.date === date) });
      }
      if (u.pathname === '/api/history') {
        const status = u.searchParams.get('status') || '';
        const priority = u.searchParams.get('priority') || '';
        const start = u.searchParams.get('start') || '';
        const end = u.searchParams.get('end') || '';
        const q = u.searchParams.get('q') || '';
        return send(200, getHistory({ status, priority, start, end, q }));
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
          return send(200, addTask(json.text, json.source || 'http', json.priority || 'normal'));
        }
        if (u.pathname === '/api/complete') {
          if (!json.id) return send(400, { error: 'id required' });
          return send(200, setStatus(json.id, 'done'));
        }
        if (u.pathname === '/api/priority') {
          if (!json.id) return send(400, { error: 'id required' });
          return send(200, togglePriority(json.id));
        }
        if (u.pathname === '/api/tasks/postpone') {
          return send(200, postponeUndoneTasks());
        }
        if (u.pathname === '/api/update') {
          if (!json.id) return send(400, { error: 'id required' });
          return send(200, updateTask(json.id, json));
        }
        if (u.pathname === '/api/delete') {
          if (!json.id) return send(400, { error: 'id required' });
          return send(200, deleteTask(json.id));
        }
        if (u.pathname === '/api/focus/start') return send(200, focusStart(json.minutes, json.taskId));
        if (u.pathname === '/api/focus/pause') return send(200, focusPause());
        if (u.pathname === '/api/focus/stop') return send(200, focusStop(false));
        return send(404, { error: 'not found' });
      });
      return;
    }
    return send(404, { error: 'not found' });
  });

  server.on('error', err => {
    console.error('[FocusFlow] Local server error:', err.message);
    if (err.code === 'EADDRINUSE') {
      console.warn(`[FocusFlow] Port ${PORT} already in use.`);
    }
  });

  serverInstance = server;
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[FocusFlow] Local API server ready at http://127.0.0.1:${PORT}`);
  });
}

function startWatchers() {
  try {
    lastClip = clipboard.readText() || '';
  } catch (e) {}

  // Clipboard watcher (respects config)
  setInterval(() => {
    try {
      const cfg = load(CONFIG_FILE, {});
      if (cfg.clipboardWatch === false) return;
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

  // Inbox file watcher
  setInterval(() => {
    try {
      if (fs.existsSync(INBOX_FILE)) {
        const stat = fs.statSync(INBOX_FILE);
        if (stat.size > 0) {
          const content = fs.readFileSync(INBOX_FILE, 'utf8');
          fs.writeFileSync(INBOX_FILE, '');
          if (content.trim()) addTask(content, 'inbox');
        }
      }
    } catch (e) { /* ignore */ }
  }, 2000);
}

function applyAutoStart() {
  try {
    const cfg = load(CONFIG_FILE, {});
    app.setLoginItemSettings({ openAtLogin: !!cfg.autoStart });
  } catch (e) { /* ignore */ }
}

async function askAI(message) {
  const cfg = load(CONFIG_FILE, {});
  if (!cfg.apiKey) return { ok: false, error: '未配置 API Key，请到「设置」标签页填写后重试' };
  try {
    const today = todayStr();
    const sys = `今天是${today}。你是任务提取器。从用户消息中提取待办任务，输出严格的JSON数组，每个元素形如 {"title":"简洁任务名","date":"YYYY-MM-DD","time":"HH:MM"或null,"priority":"normal"或"high"}。相对日期（后天/明天/下周三等）必须换算成具体日期。如果没有任务，输出 []。不要输出JSON以外的任何内容。`;
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
    const store = load(TASKS_FILE, { tasks: [], focusHistory: [] });
    items.forEach(it => {
      store.tasks.push({
        id: 't' + Date.now() + Math.random().toString(36).slice(2, 7),
        title: String(it.title || '新任务').slice(0, 120),
        date: it.date || today,
        time: it.time || null,
        priority: it.priority === 'high' ? 'high' : 'normal',
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
  const data = load(TASKS_FILE, { tasks: [], focusHistory: [] });
  const today = todayStr();
  const dayTasks = (data.tasks || []).filter(t => t.date === today);
  // Sort: high priority first, then createdAt
  dayTasks.sort((a, b) => {
    if (a.priority === 'high' && b.priority !== 'high') return -1;
    if (a.priority !== 'high' && b.priority === 'high') return 1;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
  return {
    date: today,
    tasks: dayTasks,
    allTasks: (data.tasks || []).filter(t => t.status !== 'done').slice(-30),
    focus: {
      running: focus.running,
      paused: focus.paused,
      mode: focus.mode || 'work',
      pomodoroCount: focus.pomodoroCount || 0,
      remaining: focus.remaining,
      totalSeconds: focus.totalSeconds || (focus.minutes * 60),
      minutes: focus.minutes,
      taskId: focus.taskId
    },
    focusToday: (data.focusHistory || []).filter(h => h.date === today).reduce((s, h) => s + h.minutes, 0),
    config: load(CONFIG_FILE, {}),
    dockEdge
  };
});

ipcMain.handle('add-task', (e, p) => addTask(p.text, p.source || 'manual', p.priority || 'normal'));
ipcMain.handle('set-status', (e, p) => setStatus(p.id, p.status));
ipcMain.handle('delete-task', (e, p) => deleteTask(p.id));
ipcMain.handle('toggle-priority', (e, id) => togglePriority(id));
ipcMain.handle('postpone-undone', () => postponeUndoneTasks());
ipcMain.handle('update-task', (e, p) => updateTask(p.id, p));
ipcMain.handle('get-history', (e, p) => getHistory(p || {}));
ipcMain.handle('focus-start', (e, p) => focusStart(p.minutes, p.taskId));
ipcMain.handle('focus-pause', () => focusPause());
ipcMain.handle('focus-stop', () => focusStop(false));
ipcMain.handle('ask-ai', (e, message) => askAI(message));

ipcMain.handle('save-config', (e, c) => {
  const cfg = load(CONFIG_FILE, {});
  Object.assign(cfg, {
    apiKey: c.apiKey !== undefined ? String(c.apiKey) : cfg.apiKey,
    baseUrl: c.baseUrl || cfg.baseUrl,
    model: c.model || cfg.model,
    autoStart: !!c.autoStart,
    clipboardWatch: c.clipboardWatch !== undefined ? !!c.clipboardWatch : (cfg.clipboardWatch !== false),
    hotkey: c.hotkey || cfg.hotkey || 'Alt+Shift+F',
    soundEnabled: c.soundEnabled !== undefined ? !!c.soundEnabled : (cfg.soundEnabled !== false),
    edgeSnapping: c.edgeSnapping !== undefined ? !!c.edgeSnapping : (cfg.edgeSnapping !== false),
    themeMode: c.themeMode || cfg.themeMode || 'pet'
  });
  save(CONFIG_FILE, cfg);
  applyAutoStart();
  registerGlobalShortcut();
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
ipcMain.on('drag-end', () => {
  dragBase = null;
  persistAnchor();
  checkEdgeDock();
});

ipcMain.on('undock', () => undockEdge());
ipcMain.on('redock', () => redockEdge());

ipcMain.on('show-menu', () => {
  const menu = Menu.buildFromTemplate([
    { label: expanded ? '收起面板' : '展开面板 (Alt+Shift+F)', click: () => setExpanded(!expanded) },
    { label: '重置悬浮球位置', click: () => resetAnchor() },
    { label: '未完成顺延至明天', click: () => postponeUndoneTasks() },
    { label: '历史记录', click: () => createHistoryWindow() },
    { label: '打开数据目录', click: () => shell.openPath(DATA_DIR) },
    { type: 'separator' },
    { label: '退出 Focus Flow', click: () => app.quit() }
  ]);
  menu.popup({ window: win });
});

ipcMain.on('open-history', () => createHistoryWindow());

app.whenReady().then(() => {
  ensureFiles();
  createBallWindow();
  createTray();
  registerGlobalShortcut();
  startServer();
  startWatchers();
  applyAutoStart();
});

process.on('uncaughtException', (err) => {
  try {
    fs.appendFileSync(path.join(DATA_DIR, 'error.log'), `[${new Date().toISOString()}] Uncaught: ${err.stack || err}\n`);
  } catch (e) {}
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Keep background process alive with Tray/Server running even if ball window is closed
});
app.on('before-quit', () => persistAnchor());
