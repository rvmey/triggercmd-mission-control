import { app, BrowserWindow, shell, Menu, ipcMain } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

// Prefer the dedicated (high-performance) GPU on hybrid-graphics systems (e.g. NVIDIA + Intel).
// This ensures WebGPU picks the NVIDIA adapter instead of the integrated Intel GPU.
app.commandLine.appendSwitch('force_high_performance_gpu');

function buildMenu() {
  const template = [
    // On macOS the first menu is always the app name menu; add Edit for copy/paste support
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'TRIGGERcmd Website',
          click: () => shell.openExternal('https://www.triggercmd.com'),
        },
        {
          label: 'Get Your Token',
          click: () => shell.openExternal('https://www.triggercmd.com/user/computer/create'),
        },
        ...(isDev ? [
          { type: 'separator' },
          { role: 'toggleDevTools' },
          {
            label: 'GPU Info (chrome://gpu)',
            click: () => {
              const gpuWin = new BrowserWindow({ width: 1000, height: 800, title: 'GPU Info' });
              gpuWin.loadURL('chrome://gpu');
            },
          },
        ] : []),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'TRIGGERcmd Mission Control',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      // Allow cross-origin requests to triggercmd.com API from file://
      webSecurity: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links in the OS browser, not inside Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'));
  }
}

const getCommandsJsonPath = () => join(homedir(), '.TRIGGERcmdData', 'commands.json');

ipcMain.handle('fs:read-token', () => {
  const p = join(homedir(), '.TRIGGERcmdData', 'token.tkn');
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf-8').trim();
});

ipcMain.handle('fs:commands-json-info', () => {
  const p = getCommandsJsonPath();
  return { path: p, exists: existsSync(p) };
});

ipcMain.handle('fs:read-commands-json', () => {
  const p = getCommandsJsonPath();
  if (!existsSync(p)) throw new Error('commands.json not found at ' + p);
  return readFileSync(p, 'utf-8');
});

ipcMain.handle('fs:write-commands-json', (_event, content) => {
  const p = getCommandsJsonPath();
  const backup = p + '.bak.' + Date.now();
  if (existsSync(p)) copyFileSync(p, backup);
  writeFileSync(p, content, 'utf-8');
  return { written: p, backup };
});

ipcMain.handle('fs:write-file', (_event, filePath, content) => {
  mkdirSync(dirname(filePath), { recursive: true });
  let backup = null;
  if (existsSync(filePath)) {
    backup = filePath + '.bak.' + Date.now();
    copyFileSync(filePath, backup);
  }
  writeFileSync(filePath, content, 'utf-8');
  return { written: filePath, backup };
});

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
