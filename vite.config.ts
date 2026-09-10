import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/crumbproof/' : '/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
  },
  resolve: {
    alias: {
      buffer: 'buffer/',
    },
  },
})
