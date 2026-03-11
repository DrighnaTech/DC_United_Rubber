import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['leaflet', 'react-leaflet'],
  },
  server: {
    port: 5173,
    proxy: {
      // Sales Order routes — /api/v1/* passed through as-is (backend has /api/v1 prefix)
      '/api/v1': {
        target: 'http://localhost:6060',
        changeOrigin: true,
      },
      // Existing routes — strip /api prefix before forwarding
      '/api': {
        target: 'http://localhost:6060',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
