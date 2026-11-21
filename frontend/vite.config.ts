import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Send /api/* calls to FastAPI, so the browser sees origin
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
