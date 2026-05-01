const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (data) => ipcRenderer.invoke('set-config', data),

  // Device / connection status
  getDeviceStatus: () => ipcRenderer.invoke('get-device-status'),
  onStatusChange: (cb) => {
    const handler = (_event, status) => cb(status);
    ipcRenderer.on('device-status', handler);
    return () => ipcRenderer.removeListener('device-status', handler);
  },

  // Push local auth token to main process (used to authenticate P2P proxied requests)
  syncLocalToken: (token) => ipcRenderer.invoke('sync-local-token', token),

  // Misc
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  platform: process.platform,
});
