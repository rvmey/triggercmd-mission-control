import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Use relative base in production so assets resolve correctly when loaded via file://
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  server: {
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: {
      '/api': {
        target: 'https://www.triggercmd.com',
        changeOrigin: true,
      },
      '/ollama': {
        target: process.env.VITE_OLLAMA_URL || 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama/, ''),
      },
    }
  }
}))
