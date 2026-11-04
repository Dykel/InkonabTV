// What the player page can use from the desktop app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Desktop', {
  platform: process.platform,
  vpn: {
    status: () => ipcRenderer.invoke('vpn:status'),
    connect: hosts => ipcRenderer.invoke('vpn:connect', hosts),
    disconnect: () => ipcRenderer.invoke('vpn:disconnect'),
  },
  media: {
    base: () => ipcRenderer.invoke('media:base'),
  },
  // Same calls as the Android app's updater (Native.player), so app.js uses one flow for both.
  updater: {
    appVersion: () => ipcRenderer.invoke('update:version'),
    updateInfo: o => ipcRenderer.invoke('update:info', o),
    updateDownload: o => ipcRenderer.invoke('update:download', o),
    updateInstall: () => ipcRenderer.invoke('update:install'),
    addListener: (name, fn) => {
      const h = (_e, p) => fn(p);
      if (name === 'update') ipcRenderer.on('update:progress', h);
      return Promise.resolve({ remove: () => ipcRenderer.removeListener('update:progress', h) });
    },
  },
});
