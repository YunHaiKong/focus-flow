const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ff', {
  getState: () => ipcRenderer.invoke('get-state'),
  addTask: (text, source) => ipcRenderer.invoke('add-task', { text, source }),
  setStatus: (id, status) => ipcRenderer.invoke('set-status', { id, status }),
  focusStart: (minutes, taskId) => ipcRenderer.invoke('focus-start', { minutes, taskId }),
  focusStop: () => ipcRenderer.invoke('focus-stop'),
  saveConfig: cfg => ipcRenderer.invoke('save-config', cfg),
  askAI: message => ipcRenderer.invoke('ask-ai', message),

  expand: () => ipcRenderer.send('expand'),
  shrink: () => ipcRenderer.send('shrink'),
  clickBall: () => ipcRenderer.send('ball-click'),
  showMenu: () => ipcRenderer.send('show-menu'),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: (dx, dy) => ipcRenderer.send('drag-move', dx, dy),
  dragEnd: () => ipcRenderer.send('drag-end'),

  onUI: cb => ipcRenderer.on('ui-state', (_, s) => cb(s)),
  onRefresh: cb => ipcRenderer.on('refresh-state', () => cb()),
  onTick: cb => ipcRenderer.on('focus-tick', (_, s) => cb(s)),
});
