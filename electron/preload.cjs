// Must use CommonJS require — ESM import is not supported in Electron preload scripts
const { contextBridge } = require('electron');

// Expose a flag so the renderer knows it's running inside Electron,
// and optional AI API keys from environment variables.
contextBridge.exposeInMainWorld('electronEnv', {
  isElectron: true,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
});
