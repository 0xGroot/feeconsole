import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: 'app',
  base: './',
  publicDir: '../public',
  build: {
    outDir: '../build-out',
    emptyOutDir: true,
  },
})
