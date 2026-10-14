/**
 * Focus Flow Cloud Sync Hub
 * 
 * Provides real-time synchronization between Desktop (Electron),
 * Mobile (PWA / Mini Program), and Web browser client.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Optional ws dependency with graceful fallback
let WebSocketServer = null;
try {
  const ws = require('ws');
  WebSocketServer = ws.Server;
} catch (e) {
  console.warn('[FocusFlow Server] "ws" module not installed. Run `npm install` inside server/ for real-time WebSocket support.');
}

const PORT = process.env.PORT || 23120;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'sync-store.json');

// Ensure storage directory
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory Room State: Map<syncKey, RoomData>
// RoomData: { tasks: Map<id, Task>, focusState: Object, lastUpdated: number }
const rooms = new Map();

// Active WebSocket connections: Map<syncKey, Set<{ ws, deviceId }>>
const roomSockets = new Map();

function loadStorage() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) {
          const taskMap = new Map();
          if (Array.isArray(v.tasks)) {
            v.tasks.forEach(t => {
              if (t && t.id) taskMap.set(t.id, t);
            });
          }
          rooms.set(k, {
            tasks: taskMap,
            focusState: v.focusState || null,
            lastUpdated: v.lastUpdated || Date.now()
          });
        }
        console.log(`[FocusFlow Server] Loaded ${rooms.size} sync rooms from storage.`);
      }
    }
  } catch (err) {
    console.error('[FocusFlow Server] Failed to load sync-store.json:', err.message);
  }
}

let saveTimer = null;
function queueSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const dump = {};
      for (const [k, v] of rooms.entries()) {
        dump[k] = {
          tasks: Array.from(v.tasks.values()),
          focusState: v.focusState,
          lastUpdated: v.lastUpdated
        };
      }
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(dump, null, 2), 'utf8');
      fs.renameSync(tmp, DB_FILE);
    } catch (e) {
      console.error('[FocusFlow Server] Failed to persist data:', e.message);
    }
  }, 1000);
}

function getOrCreateRoom(key) {
  if (!rooms.has(key)) {
    rooms.set(key, {
      tasks: new Map(),
      focusState: null,
      lastUpdated: Date.now()
    });
  }
  return rooms.get(key);
}

/**
 * Merge incoming task array into Room using Last-Write-Wins (LWW)
 */
function mergeTasks(room, incomingTasks) {
  const changed = [];
  if (!Array.isArray(incomingTasks)) return changed;

  const now = Date.now();
  for (const item of incomingTasks) {
    if (!item || !item.id) continue;
    const existing = room.tasks.get(item.id);

    const incomingUpdatedAt = item.updatedAt || now;
    if (!existing || incomingUpdatedAt >= (existing.updatedAt || 0)) {
      const merged = Object.assign({}, existing || {}, item, {
        updatedAt: incomingUpdatedAt,
        deleted: !!item.deleted
      });
      room.tasks.set(item.id, merged);
      changed.push(merged);
    }
  }

  if (changed.length > 0) {
    room.lastUpdated = now;
    queueSave();
  }
  return changed;
}

/**
 * Update Room's pomodoro / focus state
 */
function updateFocusState(room, state) {
  if (!state) return false;
  const now = Date.now();
  const stateUpdated = state.updatedAt || now;
  const currentUpdated = room.focusState ? (room.focusState.updatedAt || 0) : 0;

  if (!room.focusState || stateUpdated >= currentUpdated) {
    room.focusState = Object.assign({}, state, { updatedAt: stateUpdated });
    room.lastUpdated = now;
    queueSave();
    return true;
  }
  return false;
}

// Broadcast to other devices connected with the same sync key
function broadcastToRoom(key, message, excludeWs = null) {
  const set = roomSockets.get(key);
  if (!set || set.size === 0) return;

  const payload = JSON.stringify(message);
  for (const client of set) {
    if (client.ws !== excludeWs && client.ws.readyState === 1 /* OPEN */) {
      try {
        client.ws.send(payload);
      } catch (err) {
        // ignore send errors
      }
    }
  }
}

// ---------------------- HTTP Server ----------------------
const server = http.createServer((req, res) => {
  // CORS Headers for Web / Mobile
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Sync-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 1. Health check
  if (pathname === '/health' || pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'focus-flow-cloud-sync',
      version: '1.0.0',
      activeRooms: rooms.size,
      serverTime: Date.now()
    }));
    return;
  }

  // 2. GET /api/pull?key=...&since=...
  if (req.method === 'GET' && pathname === '/api/pull') {
    const key = parsedUrl.query.key;
    if (!key) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Missing "key" query parameter' }));
      return;
    }
    const since = parseInt(parsedUrl.query.since || '0', 10);
    const room = getOrCreateRoom(key);

    const tasks = Array.from(room.tasks.values()).filter(t => (t.updatedAt || 0) >= since);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      serverTime: Date.now(),
      tasks,
      focusState: room.focusState
    }));
    return;
  }

  // 3. POST /api/sync
  if (req.method === 'POST' && pathname === '/api/sync') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) { // 5MB limit
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const key = payload.key || req.headers['x-sync-key'];
        if (!key) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Missing sync key' }));
          return;
        }

        const room = getOrCreateRoom(key);
        const deviceId = payload.deviceId || 'unknown';
        const since = parseInt(payload.lastSyncAt || '0', 10);

        // Process incoming mutations
        let changedTasks = [];
        if (payload.mutations) {
          if (Array.isArray(payload.mutations.tasks)) {
            changedTasks = mergeTasks(room, payload.mutations.tasks);
            if (changedTasks.length > 0) {
              broadcastToRoom(key, {
                type: 'TASK_MUTATION',
                fromDeviceId: deviceId,
                payload: { tasks: changedTasks }
              });
            }
          }

          if (payload.mutations.focusState) {
            const updated = updateFocusState(room, payload.mutations.focusState);
            if (updated) {
              broadcastToRoom(key, {
                type: 'FOCUS_CHANGE',
                fromDeviceId: deviceId,
                payload: { focusState: room.focusState }
              });
            }
          }
        }

        // Return all tasks updated since client's lastSyncAt
        const returnTasks = Array.from(room.tasks.values()).filter(t => (t.updatedAt || 0) >= since);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          serverTime: Date.now(),
          tasks: returnTasks,
          focusState: room.focusState
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON payload: ' + e.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

// ---------------------- WebSocket Server ----------------------
if (WebSocketServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const parsed = url.parse(request.url, true);
    if (parsed.pathname === '/ws') {
      const key = parsed.query.key;
      if (!key) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request, key, parsed.query.deviceId || 'anon');
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, request, key, deviceId) => {
    if (!roomSockets.has(key)) {
      roomSockets.set(key, new Set());
    }
    const clientRecord = { ws, deviceId };
    roomSockets.get(key).add(clientRecord);

    const room = getOrCreateRoom(key);

    // Send initial snapshot to newly connected client
    try {
      ws.send(JSON.stringify({
        type: 'INIT_SNAPSHOT',
        payload: {
          serverTime: Date.now(),
          tasks: Array.from(room.tasks.values()),
          focusState: room.focusState
        }
      }));
    } catch (e) {}

    // Heartbeat
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', data => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', time: Date.now() }));
          return;
        }

        if (msg.type === 'TASK_MUTATION') {
          const tasks = msg.payload && msg.payload.tasks;
          const merged = mergeTasks(room, tasks);
          if (merged.length > 0) {
            broadcastToRoom(key, {
              type: 'TASK_MUTATION',
              fromDeviceId: deviceId,
              payload: { tasks: merged }
            }, ws);
          }
        } else if (msg.type === 'FOCUS_CHANGE') {
          const state = msg.payload && msg.payload.focusState;
          if (updateFocusState(room, state)) {
            broadcastToRoom(key, {
              type: 'FOCUS_CHANGE',
              fromDeviceId: deviceId,
              payload: { focusState: room.focusState }
            }, ws);
          }
        }
      } catch (err) {
        console.warn(`[FocusFlow WS] Error parsing message from ${deviceId}:`, err.message);
      }
    });

    ws.on('close', () => {
      const set = roomSockets.get(key);
      if (set) {
        set.delete(clientRecord);
        if (set.size === 0) roomSockets.delete(key);
      }
    });
  });

  // Ping all clients every 30s to prune dead sockets
  setInterval(() => {
    wss.clients.forEach(ws => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch (e) {}
    });
  }, 30000);
}

// Start HTTP and WebSocket server
loadStorage();
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Focus Flow Cloud Sync Hub running on port ${PORT}`);
  console.log(`   - HTTP Endpoint: http://localhost:${PORT}/api/sync`);
  console.log(`   - WebSocket:     ws://localhost:${PORT}/ws?key=<YOUR_SYNC_KEY>`);
  console.log(`   - Data File:     ${DB_FILE}`);
  console.log(`=======================================================`);
});
