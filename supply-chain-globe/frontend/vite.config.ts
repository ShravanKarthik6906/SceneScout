import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Forwards /api/* to the FastAPI backend during dev — the frontend
      // fetches relative paths, same pattern GeoPhoto's own server uses.
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
