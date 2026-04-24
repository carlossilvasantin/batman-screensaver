const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('batman', {
  onCommand: (cb) => ipcRenderer.on('command', (_, data) => cb(data)),
});
