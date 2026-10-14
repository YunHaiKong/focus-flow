/**
 * Focus Flow Universal Sync Client
 * 
 * Works in both Node.js (Electron main process) and Browser (Web / PWA / Mobile).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FocusFlowSyncClient = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // Resolve WebSocket implementation
  function getWebSocketClass() {
    if (typeof WebSocket !== 'undefined') {
      return WebSocket;
    }
    if (typeof globalThis !== 'undefined' && globalThis.WebSocket) {
      return globalThis.WebSocket;
    }
    try {
      return require('ws');
    } catch (e) {
      return null;
    }
  }

  class SyncClient {
    constructor(options = {}) {
      this.serverUrl = options.serverUrl || 'http://localhost:23120';
      this.syncKey = options.syncKey || '';
      this.deviceId = options.deviceId || ('dev_' + Math.random().toString(36).slice(2, 9));
      this.enabled = !!options.enabled;

      this.ws = null;
      this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'
      this.reconnectTimer = null;
      this.reconnectDelay = 2000;
      this.pingTimer = null;
      this.lastSyncAt = 0;
      this.offlineTaskQueue = new Map(); // id -> task

      // Callbacks
      this.onStatusChange = options.onStatusChange || (() => {});
      this.onTasksReceived = options.onTasksReceived || (() => {});
      this.onFocusReceived = options.onFocusReceived || (() => {});
    }

    setStatus(status) {
      if (this.status !== status) {
        this.status = status;
        this.onStatusChange(status);
      }
    }

    updateConfig(options = {}) {
      const needsReconnect = (options.serverUrl && options.serverUrl !== this.serverUrl) ||
                             (options.syncKey && options.syncKey !== this.syncKey) ||
                             (options.enabled !== undefined && options.enabled !== this.enabled);

      if (options.serverUrl) this.serverUrl = options.serverUrl.replace(/\/+$/, '');
      if (options.syncKey !== undefined) this.syncKey = options.syncKey.trim();
      if (options.deviceId) this.deviceId = options.deviceId;
      if (options.enabled !== undefined) this.enabled = !!options.enabled;

      if (needsReconnect) {
        this.disconnect();
        if (this.enabled && this.syncKey) {
          this.connect();
        }
      }
    }

    getWsUrl() {
      const base = this.serverUrl.replace(/^http/, 'ws');
      return `${base}/ws?key=${encodeURIComponent(this.syncKey)}&deviceId=${encodeURIComponent(this.deviceId)}`;
    }

    connect() {
      if (!this.enabled || !this.syncKey) {
        this.setStatus('disconnected');
        return;
      }

      this.disconnect();
      this.setStatus('connecting');

      const WSClass = getWebSocketClass();
      if (!WSClass) {
        console.warn('[SyncClient] WebSocket not available, falling back to HTTP sync.');
        this.syncHttp();
        return;
      }

      try {
        const wsUrl = this.getWsUrl();
        this.ws = new WSClass(wsUrl);

        this.ws.onopen = () => {
          this.setStatus('connected');
          this.reconnectDelay = 2000;
          this.startHeartbeat();
          this.flushOfflineQueue();
        };

        this.ws.onmessage = event => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (e) {
            console.warn('[SyncClient] Invalid WS message:', e.message);
          }
        };

        this.ws.onerror = err => {
          this.setStatus('error');
        };

        this.ws.onclose = () => {
          this.stopHeartbeat();
          this.setStatus('disconnected');
          this.scheduleReconnect();
        };
      } catch (err) {
        this.setStatus('error');
        this.scheduleReconnect();
      }
    }

    disconnect() {
      clearTimeout(this.reconnectTimer);
      this.stopHeartbeat();
      if (this.ws) {
        try {
          this.ws.onopen = null;
          this.ws.onmessage = null;
          this.ws.onerror = null;
          this.ws.onclose = null;
          this.ws.close();
        } catch (e) {}
        this.ws = null;
      }
      this.setStatus('disconnected');
    }

    scheduleReconnect() {
      if (!this.enabled || !this.syncKey) return;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
        this.connect();
      }, this.reconnectDelay);
    }

    startHeartbeat() {
      this.stopHeartbeat();
      this.pingTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === 1 /* OPEN */) {
          try {
            this.ws.send(JSON.stringify({ type: 'PING' }));
          } catch (e) {}
        }
      }, 25000);
    }

    stopHeartbeat() {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    handleMessage(msg) {
      if (!msg) return;
      if (msg.type === 'INIT_SNAPSHOT') {
        if (msg.payload && Array.isArray(msg.payload.tasks)) {
          this.onTasksReceived(msg.payload.tasks);
        }
        if (msg.payload && msg.payload.focusState) {
          this.onFocusReceived(msg.payload.focusState);
        }
      } else if (msg.type === 'TASK_MUTATION') {
        if (msg.payload && Array.isArray(msg.payload.tasks)) {
          this.onTasksReceived(msg.payload.tasks);
        }
      } else if (msg.type === 'FOCUS_CHANGE') {
        if (msg.payload && msg.payload.focusState) {
          this.onFocusReceived(msg.payload.focusState);
        }
      }
    }

    /**
     * Notify cloud of task creation / updates / deletions
     */
    pushTasks(tasks) {
      if (!Array.isArray(tasks) || tasks.length === 0) return;

      const payloadTasks = tasks.map(t => Object.assign({}, t, {
        updatedAt: t.updatedAt || Date.now(),
        deleted: !!t.deleted
      }));

      // Cache in offline queue
      payloadTasks.forEach(t => this.offlineTaskQueue.set(t.id, t));

      if (this.ws && this.ws.readyState === 1 /* OPEN */) {
        try {
          this.ws.send(JSON.stringify({
            type: 'TASK_MUTATION',
            payload: { tasks: payloadTasks }
          }));
          payloadTasks.forEach(t => this.offlineTaskQueue.delete(t.id));
        } catch (e) {
          // Keep in queue
        }
      } else {
        // Fallback to HTTP sync if not connected
        this.syncHttp();
      }
    }

    /**
     * Notify cloud of focus timer state changes
     */
    pushFocus(focusState) {
      if (!focusState) return;
      const state = Object.assign({}, focusState, { updatedAt: Date.now() });

      if (this.ws && this.ws.readyState === 1 /* OPEN */) {
        try {
          this.ws.send(JSON.stringify({
            type: 'FOCUS_CHANGE',
            payload: { focusState: state }
          }));
        } catch (e) {}
      } else {
        this.syncHttp({ focusState: state });
      }
    }

    flushOfflineQueue() {
      if (this.offlineTaskQueue.size === 0) return;
      const pending = Array.from(this.offlineTaskQueue.values());
      if (this.ws && this.ws.readyState === 1) {
        try {
          this.ws.send(JSON.stringify({
            type: 'TASK_MUTATION',
            payload: { tasks: pending }
          }));
          this.offlineTaskQueue.clear();
        } catch (e) {}
      }
    }

    /**
     * Fallback HTTP Sync
     */
    async syncHttp(extraMutations = null) {
      if (!this.enabled || !this.syncKey) return;

      const tasksToPush = Array.from(this.offlineTaskQueue.values());
      const mutations = {
        tasks: tasksToPush
      };
      if (extraMutations && extraMutations.focusState) {
        mutations.focusState = extraMutations.focusState;
      }

      try {
        const fetchFn = typeof fetch !== 'undefined' ? fetch : (await import('node-fetch').then(m => m.default).catch(() => null));
        if (!fetchFn) return;

        const res = await fetchFn(`${this.serverUrl}/api/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: this.syncKey,
            deviceId: this.deviceId,
            lastSyncAt: this.lastSyncAt,
            mutations
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            this.lastSyncAt = data.serverTime || Date.now();
            this.offlineTaskQueue.clear();
            if (Array.isArray(data.tasks) && data.tasks.length > 0) {
              this.onTasksReceived(data.tasks);
            }
            if (data.focusState) {
              this.onFocusReceived(data.focusState);
            }
          }
        }
      } catch (err) {
        // Silently fail on network disconnect
      }
    }
  }

  return SyncClient;
}));
