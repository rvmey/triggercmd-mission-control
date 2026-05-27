// Must use CommonJS require — ESM import is not supported in Electron preload scripts
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronEnv', {
  isElectron: true,
  platform: process.platform,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  readToken: () => ipcRenderer.invoke('fs:read-token'),
  commandsJson: {
    getInfo: () => ipcRenderer.invoke('fs:commands-json-info'),
    read: () => ipcRenderer.invoke('fs:read-commands-json'),
    write: (content) => ipcRenderer.invoke('fs:write-commands-json', content),
  },
  fileSystem: {
    writeFile: (filePath, content) => ipcRenderer.invoke('fs:write-file', filePath, content),
  },
});
