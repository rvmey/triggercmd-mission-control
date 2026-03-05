// Must use CommonJS require — ESM import is not supported in Electron preload scripts
const { contextBridge } = require('electron');

// Expose a flag so the renderer knows it's running inside Electron
contextBridge.exposeInMainWorld('electronEnv', {
  isElectron: true,
});
