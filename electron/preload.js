import { contextBridge } from 'electron';

// Expose a flag so the renderer knows it's running inside Electron
contextBridge.exposeInMainWorld('electronEnv', {
  isElectron: true,
});
