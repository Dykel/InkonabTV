// InkonabTV for Windows: the web player in a desktop window.
//
// A desktop app may play the provider's plain-HTTP video directly (no relay, no helper):
// web security is off for this window only, and it only ever loads the bundled player.
const { app, BrowserWindow, shell, ipcMain, Menu } = require('electron');
const path = require('path');
const vpn = require('./vpn');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) app.quit();

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 780,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#05090b',
    title: 'InkonabTV',
    icon: path.join(__dirname, 'www', 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // plain-HTTP video and provider APIs without CORS
      allowRunningInsecureContent: true,
      contextIsolation: true,
      sandbox: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'www', 'index.html'));

  // Links to other sites open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); }
  });
  // F11: full screen.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on('window-all-closed', async () => { await vpn.disconnect().catch(() => {}); app.quit(); });

// VPN, asked for by the page (preload.js).
ipcMain.handle('vpn:status', () => vpn.status());
ipcMain.handle('vpn:connect', (_e, hosts) => vpn.connect(hosts));
ipcMain.handle('vpn:disconnect', () => vpn.disconnect());
