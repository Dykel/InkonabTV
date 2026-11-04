// What the player page can use from the desktop app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Desktop', {
  platform: process.platform,
  vpn: {
    status: () => ipcRenderer.invoke('vpn:status'),
    connect: hosts => ipcRenderer.invoke('vpn:connect', hosts),
    disconnect: () => ipcRenderer.invoke('vpn:disconnect'),
  },
});
