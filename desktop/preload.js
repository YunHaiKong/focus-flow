const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ff', {
  getState: () => ipcRenderer.invoke('get-state'),
  addTask: (text, source) => ipcRenderer.invoke('add-task', { text, source }),
  setStatus: (id, status) => ipcRenderer.invoke('set-status', { id, status }),
  updateTask: (id, fields) => ipcRenderer.invoke('update-task', Object.assign({ id }, fields)),
  deleteTask: id => ipcRenderer.invoke('delete-task', { id }),
  getHistory: filters => ipcRenderer.invoke('get-history', filters || {}),
  focusStart: (minutes, taskId) => ipcRenderer.invoke('focus-start', { minutes, taskId }),
  focusPause: () => ipcRenderer.invoke('focus-pause'),
  focusStop: () => ipcRenderer.invoke('focus-stop'),
  saveConfig: cfg => ipcRenderer.invoke('save-config', cfg),
  askAI: message => ipcRenderer.invoke('ask-ai', message),
  openHistory: () => ipcRenderer.send('open-history'),
  togglePriority: id => ipcRenderer.invoke('toggle-priority', id),
  postponeUndone: () => ipcRenderer.invoke('postpone-undone'),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  triggerSync: () => ipcRenderer.invoke('trigger-sync'),

  expand: () => ipcRenderer.send('expand'),
  shrink: () => ipcRenderer.send('shrink'),
  clickBall: () => ipcRenderer.send('ball-click'),
  showMenu: () => ipcRenderer.send('show-menu'),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: (dx, dy) => ipcRenderer.send('drag-move', dx, dy),
  dragEnd: () => ipcRenderer.send('drag-end'),
  undock: () => ipcRenderer.send('undock'),
  redock: () => ipcRenderer.send('redock'),

  onUI: cb => ipcRenderer.on('ui-state', (_, s) => cb(s)),
  onRefresh: cb => ipcRenderer.on('refresh-state', () => cb()),
  onTick: cb => ipcRenderer.on('focus-tick', (_, s) => cb(s)),
  onFocusInput: cb => ipcRenderer.on('focus-input', () => cb()),
  onPlayChime: cb => ipcRenderer.on('play-chime', () => cb()),
  onSyncStatus: cb => ipcRenderer.on('sync-status', (_, s) => cb(s))
});
