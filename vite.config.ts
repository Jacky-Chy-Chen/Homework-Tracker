import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works on any static host / subfolder.
  base: './',
  // WeChat's in-app browser can lag behind desktop Chrome.
  build: { target: 'es2018' },
})
