const { app, BrowserWindow } = require('electron');
const path = require('path');

const devServerUrl = process.env.TINY_BASE_IDLE_DEV_SERVER_URL || 'http://127.0.0.1:8080';
const isDevMode = process.argv.includes('--dev') || process.env.TINY_BASE_IDLE_ELECTRON_DEV === '1';
const windowIconPath = path.join(__dirname, '..', 'ASSETS', 'icon', 'TinyBaseIdle_icon.ico');

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#05070d',
    title: 'Tiny Base Idle',
    icon: windowIconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDevMode) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
