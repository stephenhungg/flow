import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    sourcemap: false, // Disable source maps in production to avoid blob URL issues
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy 3D libraries into separate chunks so they're only loaded when needed
          'three-vendor': ['three'],
          'spark-vendor': ['@sparkjsdev/spark'],
          'firebase-vendor': ['firebase/app', 'firebase/auth'],
        },
      },
    },
  },
})

