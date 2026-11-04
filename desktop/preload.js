// What the player page can use from the desktop app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Desktop', {
  platform: process.platform,
  // Same calls as the Android app's VPN (Native.player), so app.js uses one flow for both.
  vpn: {
    vpnStatus: () => ipcRenderer.invoke('vpn:status'),
    vpnConnect: () => ipcRenderer.invoke('vpn:connect'),
    vpnDisconnect: () => ipcRenderer.invoke('vpn:disconnect'),
    vpnSwitch: () => ipcRenderer.invoke('vpn:switch'),
    vpnSettings: o => ipcRenderer.invoke('vpn:settings', o),
    addListener: (name, fn) => {
      const h = (_e, v) => fn(v);
      if (name === 'vpn') ipcRenderer.on('vpn:event', h);
      return Promise.resolve({ remove: () => ipcRenderer.removeListener('vpn:event', h) });
    },
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
